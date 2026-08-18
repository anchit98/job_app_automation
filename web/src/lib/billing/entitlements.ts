/**
 * Freemium entitlements.
 *
 * Three metered actions: Apply runs, CV generations and AI tailors. New users
 * get a small free allowance of each; paid tiers top the credits up.
 *
 * Anyone who bought the original "₹299 lifetime + 60 applications" offer is on
 * the `legacy_lifetime` plan, which every check short-circuits — the free tier
 * must never claw back what they already paid for.
 */
import { dbGet, dbRun } from "@/lib/db";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";

/** Mirrors the resolver in db/queries: explicit id → request scope → session. */
async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  return getRequestUserId() ?? (await requireUser()).id;
}

export type EntitlementPlan =
  | "free"
  | "legacy_lifetime"
  | "starter"
  | "pro"
  | "enterprise";

export type MeteredAction = "apply" | "cv" | "tailor";

const CREDIT_COLUMN: Record<MeteredAction, string> = {
  apply: "apply_credits",
  cv: "cv_credits",
  tailor: "tailor_credits",
};

const USED_COLUMN: Record<MeteredAction, string> = {
  apply: "applies_used",
  cv: "cvs_generated",
  tailor: "tailors_used",
};

export const FREE_ALLOWANCE = { apply: 4, cv: 4, tailor: 4 } as const;

/** Paid top-ups, carried over from ResumeBuilderV2's TIER_CONFIG. */
export const TIER_CONFIG: Record<
  Exclude<EntitlementPlan, "free" | "legacy_lifetime">,
  { price_inr: number; label: string; apply: number; cv: number; tailor: number }
> = {
  starter: { price_inr: 100, label: "Starter", apply: 25, cv: 100, tailor: 100 },
  pro: { price_inr: 250, label: "Pro", apply: 100, cv: 500, tailor: 500 },
  enterprise: {
    price_inr: 500,
    label: "Enterprise",
    apply: 250,
    cv: 1000,
    tailor: 1000,
  },
};

export interface Entitlements extends Record<string, unknown> {
  user_id: string;
  plan: EntitlementPlan;
  apply_credits: number;
  cv_credits: number;
  tailor_credits: number;
  applies_used: number;
  cvs_generated: number;
  tailors_used: number;
}

/**
 * Which actions are metered.
 *
 * Apply is the expensive one (OpenAI calls, Drive/Docs writes, Gmail drafts),
 * so it runs on a free allowance and then asks for payment. CV building and
 * tailoring stay free for now — the builder is the top of the funnel, and
 * charging there would stop people before they ever see Apply work.
 *
 * `legacy_lifetime` users skip all of this regardless.
 */
export const METERED_ACTIONS: Record<MeteredAction, boolean> = {
  apply: true,
  cv: false,
  tailor: false,
};

/** True when this user/action pair is never blocked. */
export function isUnlimited(
  plan: EntitlementPlan,
  action?: MeteredAction,
): boolean {
  if (plan === "legacy_lifetime") return true;
  return action ? !METERED_ACTIONS[action] : false;
}

/**
 * Read a user's entitlements, creating the free-tier row on first access.
 *
 * The row is created lazily rather than at signup so existing accounts (and
 * any created outside the signup path) resolve correctly too.
 */
export async function getEntitlements(userId?: string): Promise<Entitlements> {
  const id = userId ?? (await currentUserId());
  const existing = await dbGet<Entitlements>(
    `SELECT user_id, plan, apply_credits, cv_credits, tailor_credits,
            applies_used, cvs_generated, tailors_used
       FROM user_entitlements WHERE user_id = ?`,
    id,
  );
  if (existing) return existing;

  // A paid or admin account that predates this table must not land on `free`.
  const user = await dbGet<{ is_paid: boolean; is_admin: boolean }>(
    `SELECT is_paid, is_admin FROM users WHERE id = ?`,
    id,
  );
  const legacy = Boolean(user?.is_paid || user?.is_admin);

  await dbRun(
    `INSERT INTO user_entitlements
       (user_id, plan, apply_credits, cv_credits, tailor_credits)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO NOTHING`,
    id,
    legacy ? "legacy_lifetime" : "free",
    legacy ? 60 : FREE_ALLOWANCE.apply,
    legacy ? 9999 : FREE_ALLOWANCE.cv,
    legacy ? 9999 : FREE_ALLOWANCE.tailor,
  );

  const created = await dbGet<Entitlements>(
    `SELECT user_id, plan, apply_credits, cv_credits, tailor_credits,
            applies_used, cvs_generated, tailors_used
       FROM user_entitlements WHERE user_id = ?`,
    id,
  );
  if (!created) throw new Error("Could not load your plan. Try again.");
  return created;
}

export interface CreditCheck {
  allowed: boolean;
  remaining: number;
  plan: EntitlementPlan;
  /** User-facing reason when `allowed` is false. */
  reason?: string;
}

const ACTION_LABEL: Record<MeteredAction, string> = {
  apply: "Apply run",
  cv: "CV generation",
  tailor: "AI tailor",
};

/** Read-only check — use before showing paywalls or disabling buttons. */
export async function checkCredit(
  action: MeteredAction,
  userId?: string,
): Promise<CreditCheck> {
  const ent = await getEntitlements(userId);
  if (isUnlimited(ent.plan, action)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, plan: ent.plan };
  }
  const remaining = ent[CREDIT_COLUMN[action] as keyof Entitlements] as number;
  if (remaining > 0) return { allowed: true, remaining, plan: ent.plan };
  return {
    allowed: false,
    remaining: 0,
    plan: ent.plan,
    reason: `You have used all your free ${ACTION_LABEL[action]}s. Upgrade to continue.`,
  };
}

/**
 * Atomically spend one credit.
 *
 * The decrement is guarded in SQL (`AND col > 0`) so two concurrent requests
 * cannot both consume the last credit; a caller that loses the race gets
 * `allowed: false` rather than a negative balance.
 */
export async function spendCredit(
  action: MeteredAction,
  userId?: string,
): Promise<CreditCheck> {
  const ent = await getEntitlements(userId);
  if (isUnlimited(ent.plan, action)) {
    await dbRun(
      `UPDATE user_entitlements
          SET ${USED_COLUMN[action]} = ${USED_COLUMN[action]} + 1,
              updated_at = (NOW() AT TIME ZONE 'utc')::text
        WHERE user_id = ?`,
      ent.user_id,
    );
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, plan: ent.plan };
  }

  const col = CREDIT_COLUMN[action];
  const result = await dbRun(
    `UPDATE user_entitlements
        SET ${col} = ${col} - 1,
            ${USED_COLUMN[action]} = ${USED_COLUMN[action]} + 1,
            updated_at = (NOW() AT TIME ZONE 'utc')::text
      WHERE user_id = ? AND ${col} > 0`,
    ent.user_id,
  );
  if (result.changes === 0) {
    return {
      allowed: false,
      remaining: 0,
      plan: ent.plan,
      reason: `You have used all your free ${ACTION_LABEL[action]}s. Upgrade to continue.`,
    };
  }
  return {
    allowed: true,
    remaining: (ent[col as keyof Entitlements] as number) - 1,
    plan: ent.plan,
  };
}

/** Give a credit back when the action failed after it was charged. */
export async function refundCredit(
  action: MeteredAction,
  userId?: string,
): Promise<void> {
  const ent = await getEntitlements(userId);
  if (isUnlimited(ent.plan, action)) return;
  const col = CREDIT_COLUMN[action];
  await dbRun(
    `UPDATE user_entitlements
        SET ${col} = ${col} + 1,
            ${USED_COLUMN[action]} = GREATEST(${USED_COLUMN[action]} - 1, 0),
            updated_at = (NOW() AT TIME ZONE 'utc')::text
      WHERE user_id = ?`,
    ent.user_id,
  );
}

/** Apply a purchased tier's top-up. Credits add to whatever is left. */
export async function applyTierPurchase(
  userId: string,
  tier: keyof typeof TIER_CONFIG,
): Promise<void> {
  const config = TIER_CONFIG[tier];
  await getEntitlements(userId);
  await dbRun(
    `UPDATE user_entitlements
        SET plan = ?,
            apply_credits = apply_credits + ?,
            cv_credits = cv_credits + ?,
            tailor_credits = tailor_credits + ?,
            updated_at = (NOW() AT TIME ZONE 'utc')::text
      WHERE user_id = ? AND plan <> 'legacy_lifetime'`,
    tier,
    config.apply,
    config.cv,
    config.tailor,
    userId,
  );
}
