/**
 * What JobApp OS sells, in one place.
 *
 * The billing page and the marketing site both read this. They used to state
 * the offer independently, which is how the landing page ended up advertising
 * "lifetime access, 60 applications" while the code metered Apply runs against
 * a `TIER_CONFIG` nothing could buy.
 *
 * Two products:
 *
 *   - **Plans** set how many Apply runs you get. `free` is the default every
 *     account starts on; the three paid tiers top those credits up and record
 *     which tier was bought.
 *   - **Top-ups** ("token renewal") add Apply runs without changing the plan,
 *     for someone who is happy where they are and just needs more runs.
 *
 * Apply is the only metered action (`METERED_ACTIONS` in ./entitlements) — the
 * CV builder and AI tailoring are free, because charging at the top of the
 * funnel stops people before they ever see Apply work. So everything here is
 * priced in Apply runs, and nothing claims to sell the other two.
 *
 * Client-safe: plain data, no server imports, so both surfaces can render it.
 * The plan vocabulary itself lives here rather than in ./entitlements for that
 * reason — entitlements reaches the database, and a price list must not.
 */

export type EntitlementPlan =
  | "free"
  | "legacy_lifetime"
  | "starter"
  | "pro"
  | "enterprise";

/** What a brand-new account starts with. */
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

/** A plan as the pricing table shows it. */
export interface PricingPlan {
  /** Matches `user_entitlements.plan`; "free" is never purchased. */
  code: Extract<EntitlementPlan, "free" | "starter" | "pro" | "enterprise">;
  name: string;
  /** Rupees. 0 for free. */
  priceInr: number;
  /** Apply runs this plan grants. */
  applyRuns: number;
  /** One line under the price. */
  tagline: string;
  features: string[];
  /** The one card the eye should land on. */
  highlighted?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    code: "free",
    name: "Free",
    priceInr: 0,
    applyRuns: FREE_ALLOWANCE.apply,
    tagline: "Everything works — you just get fewer Apply runs.",
    features: [
      `${FREE_ALLOWANCE.apply} Apply runs`,
      "Unlimited CV Builder and AI tailoring",
      "Job tracker, contacts and follow-ups",
      "No card required",
    ],
  },
  {
    code: "starter",
    name: TIER_CONFIG.starter.label,
    priceInr: TIER_CONFIG.starter.price_inr,
    applyRuns: TIER_CONFIG.starter.apply,
    tagline: "For a focused search over a few weeks.",
    features: [
      `${TIER_CONFIG.starter.apply} Apply runs`,
      "Everything in Free",
      "Credits never expire",
    ],
  },
  {
    code: "pro",
    name: TIER_CONFIG.pro.label,
    priceInr: TIER_CONFIG.pro.price_inr,
    applyRuns: TIER_CONFIG.pro.apply,
    tagline: "For applying at real volume.",
    features: [
      `${TIER_CONFIG.pro.apply} Apply runs`,
      "Everything in Starter",
      "Best value per application",
    ],
    highlighted: true,
  },
  {
    code: "enterprise",
    name: TIER_CONFIG.enterprise.label,
    priceInr: TIER_CONFIG.enterprise.price_inr,
    applyRuns: TIER_CONFIG.enterprise.apply,
    tagline: "For a long search, or several at once.",
    features: [
      `${TIER_CONFIG.enterprise.apply} Apply runs`,
      "Everything in Pro",
      "Priority support",
    ],
  },
];

/** A credit pack — more Apply runs, same plan. */
export interface PricingTopUp {
  code: string;
  name: string;
  priceInr: number;
  applyRuns: number;
}

/**
 * Top-up packs.
 *
 * Priced slightly above the equivalent tier on purpose: a tier is the
 * commitment, a top-up is the convenience. Keep `code` stable — it is written
 * to `razorpay_payment_links.purchase_code` and read back by the webhook, so
 * renaming one orphans any link already out in the world.
 */
export const PRICING_TOPUPS: PricingTopUp[] = [
  { code: "apply_25", name: "25 Apply runs", priceInr: 120, applyRuns: 25 },
  { code: "apply_60", name: "60 Apply runs", priceInr: 260, applyRuns: 60 },
  { code: "apply_150", name: "150 Apply runs", priceInr: 580, applyRuns: 150 },
];

export function findPlan(code: string): PricingPlan | null {
  return PRICING_PLANS.find((p) => p.code === code) ?? null;
}

export function findTopUp(code: string): PricingTopUp | null {
  return PRICING_TOPUPS.find((t) => t.code === code) ?? null;
}

/** What a purchase costs and grants, whichever kind it is. */
export type PurchaseKind = "plan" | "topup";

export interface ResolvedPurchase {
  kind: PurchaseKind;
  code: string;
  label: string;
  priceInr: number;
  applyRuns: number;
}

/**
 * Resolve a purchase request into something chargeable.
 *
 * Returns null for anything unknown or free — the caller turns that into a
 * refusal rather than a zero-rupee payment link Razorpay would reject anyway.
 */
export function resolvePurchase(
  kind: string,
  code: string,
): ResolvedPurchase | null {
  if (kind === "plan") {
    const plan = findPlan(code);
    if (!plan || plan.priceInr <= 0) return null;
    return {
      kind: "plan",
      code: plan.code,
      label: `${plan.name} — ${plan.applyRuns} Apply runs`,
      priceInr: plan.priceInr,
      applyRuns: plan.applyRuns,
    };
  }
  if (kind === "topup") {
    const pack = findTopUp(code);
    if (!pack) return null;
    return {
      kind: "topup",
      code: pack.code,
      label: `Top-up — ${pack.name}`,
      priceInr: pack.priceInr,
      applyRuns: pack.applyRuns,
    };
  }
  return null;
}

/** "₹250", or "Free". */
export function formatInr(amount: number): string {
  return amount <= 0 ? "Free" : `₹${amount}`;
}
