import { cache } from "react";
import { randomUUID } from "crypto";
import { dbGet, dbRun, getSql } from "@/lib/db";
import {
  destroySession,
  getSessionUser,
  type SessionUser,
} from "@/lib/auth/session";

export class AuthRequiredError extends Error {
  constructor(message = "Sign in required.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getSessionUser();
});

export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) throw new AuthRequiredError();
  return user;
});

export const requireAdmin = cache(async (): Promise<SessionUser> => {
  const user = await requireUser();
  if (!user.is_admin) {
    throw new AuthRequiredError("Admin access required.");
  }
  return user;
});

export async function countUsers(): Promise<number> {
  const row = (await dbGet(`SELECT COUNT(*)::int AS n FROM users`)) as
    | { n: number }
    | undefined;
  return Number(row?.n ?? 0);
}

export async function countAdmins(): Promise<number> {
  const row = (await dbGet(
    `SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true`,
  )) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export async function getUserById(userId: string) {
  return (await dbGet(
    `SELECT id, email, password_hash, full_name, is_admin, must_reset_password, is_paid
       FROM users
      WHERE id = ?`,
    userId,
  )) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string | null;
        is_admin: boolean;
        must_reset_password: boolean;
        is_paid: boolean;
      }
    | undefined;
}

export async function getUserByEmail(email: string) {
  return (await dbGet(
    `SELECT id, email, password_hash, full_name, is_admin, must_reset_password, is_paid
       FROM users
      WHERE lower(email) = lower(?)`,
    email.trim(),
  )) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string | null;
        is_admin: boolean;
        must_reset_password: boolean;
        is_paid: boolean;
      }
    | undefined;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  fullName?: string | null;
  isAdmin?: boolean;
  mustResetPassword?: boolean;
  isPaid?: boolean;
}): Promise<SessionUser> {
  const id = randomUUID();
  const isAdmin = input.isAdmin ?? false;
  const isPaid = input.isPaid ?? isAdmin;
  await dbRun(
    `INSERT INTO users (
       id, email, password_hash, full_name, is_admin, must_reset_password,
       is_paid, paid_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.email.trim().toLowerCase(),
    input.passwordHash,
    input.fullName?.trim() || null,
    isAdmin,
    input.mustResetPassword ?? false,
    isPaid,
    isPaid ? new Date().toISOString() : null,
  );
  return {
    id,
    email: input.email.trim().toLowerCase(),
    full_name: input.fullName?.trim() || null,
    is_admin: isAdmin,
    must_reset_password: input.mustResetPassword ?? false,
    is_paid: isPaid || isAdmin,
  };
}

/**
 * First signup owns legacy singleton rows + unscoped applications.
 */
export async function claimOrphanedData(userId: string): Promise<void> {
  const sql = getSql();

  const asText = (v: unknown, fallback: string | null = null): string | null => {
    if (v == null) return fallback;
    return typeof v === "string" ? v : String(v);
  };

  await sql.begin(async (tx) => {
    const legacyProfile = await tx`
      SELECT * FROM profiles_legacy WHERE id = 1 LIMIT 1
    `.catch(() => [] as Record<string, unknown>[]);
    if (legacyProfile[0]) {
      const p = legacyProfile[0] as Record<string, unknown>;
      await tx`
        INSERT INTO profiles (
          user_id, full_name, headline, location, timezone, drive_root_id,
          preferred_tone, phone, linkedin_url, github_url, portfolio_url,
          created_at, updated_at
        ) VALUES (
          ${userId},
          ${asText(p.full_name)},
          ${asText(p.headline)},
          ${asText(p.location)},
          ${asText(p.timezone, "Asia/Kolkata") ?? "Asia/Kolkata"},
          ${asText(p.drive_root_id)},
          ${asText(p.preferred_tone)},
          ${asText(p.phone)},
          ${asText(p.linkedin_url)},
          ${asText(p.github_url)},
          ${asText(p.portfolio_url)},
          ${asText(p.created_at)},
          ${asText(p.updated_at)}
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    const legacyResume = await tx`
      SELECT * FROM master_resume_legacy WHERE id = 1 LIMIT 1
    `.catch(() => [] as Record<string, unknown>[]);
    if (legacyResume[0]) {
      const r = legacyResume[0] as Record<string, unknown>;
      await tx`
        INSERT INTO master_resume (
          user_id, content, rules, doc_id, doc_layout, doc_synced_at,
          created_at, updated_at
        ) VALUES (
          ${userId},
          ${asText(r.content, "{}") ?? "{}"},
          ${asText(r.rules, '{"never_fabricate": true}') ?? '{"never_fabricate": true}'},
          ${asText(r.doc_id)},
          ${asText(r.doc_layout)},
          ${asText(r.doc_synced_at)},
          ${asText(r.created_at)},
          ${asText(r.updated_at)}
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    const legacyCover = await tx`
      SELECT * FROM master_cover_letter_legacy WHERE id = 1 LIMIT 1
    `.catch(() => [] as Record<string, unknown>[]);
    if (legacyCover[0]) {
      const c = legacyCover[0] as Record<string, unknown>;
      await tx`
        INSERT INTO master_cover_letter (
          user_id, doc_id, doc_layout, doc_synced_at, created_at, updated_at
        ) VALUES (
          ${userId},
          ${asText(c.doc_id)},
          ${asText(c.doc_layout)},
          ${asText(c.doc_synced_at)},
          ${asText(c.created_at)},
          ${asText(c.updated_at)}
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    const legacyGoogle = await tx`
      SELECT * FROM google_tokens_legacy WHERE id = 1 LIMIT 1
    `.catch(() => [] as Record<string, unknown>[]);
    if (legacyGoogle[0]) {
      const g = legacyGoogle[0] as Record<string, unknown>;
      await tx`
        INSERT INTO google_tokens (
          user_id, encrypted_access_token, encrypted_refresh_token,
          scope, expires_at, status, created_at, updated_at
        ) VALUES (
          ${userId},
          ${asText(g.encrypted_access_token) ?? ""},
          ${asText(g.encrypted_refresh_token) ?? ""},
          ${asText(g.scope) ?? ""},
          ${asText(g.expires_at) ?? ""},
          ${asText(g.status, "active") ?? "active"},
          ${asText(g.created_at)},
          ${asText(g.updated_at)}
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    const legacyExt = await tx`
      SELECT * FROM extension_tokens_legacy WHERE id = 1 LIMIT 1
    `.catch(() => [] as Record<string, unknown>[]);
    if (legacyExt[0]) {
      const e = legacyExt[0] as Record<string, unknown>;
      await tx`
        INSERT INTO extension_tokens (
          user_id, token_hash, token_prefix, created_at, revoked_at
        ) VALUES (
          ${userId},
          ${asText(e.token_hash) ?? ""},
          ${asText(e.token_prefix) ?? ""},
          ${asText(e.created_at)},
          ${asText(e.revoked_at)}
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    await tx`
      UPDATE applications SET user_id = ${userId} WHERE user_id IS NULL
    `;
    await tx`
      UPDATE prompt_runs SET user_id = ${userId} WHERE user_id IS NULL
    `;
    await tx`
      UPDATE pipeline_runs SET user_id = ${userId} WHERE user_id IS NULL
    `;
    await tx`
      UPDATE audit_log SET user_id = ${userId} WHERE user_id IS NULL
    `;
  });
}

export async function ensureUserProfile(userId: string, fullName?: string | null) {
  await dbRun(
    `INSERT INTO profiles (user_id, full_name)
     VALUES (?, ?)
     ON CONFLICT (user_id) DO NOTHING`,
    userId,
    fullName ?? null,
  );
}

export async function setUserPassword(
  userId: string,
  input: {
    passwordHash: string;
    mustResetPassword?: boolean;
    fullName?: string | null;
  },
) {
  await dbRun(
    `UPDATE users
        SET password_hash = ?,
            must_reset_password = ?,
            full_name = COALESCE(?, full_name),
            updated_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ?`,
    input.passwordHash,
    input.mustResetPassword ?? false,
    input.fullName ?? null,
    userId,
  );
}

/** Replace only the stored hash (e.g. cost-factor upgrade on login). */
export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await dbRun(
    `UPDATE users
        SET password_hash = ?,
            updated_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ?`,
    passwordHash,
    userId,
  );
}

/**
 * Flip the paid flag and keep entitlements in step.
 *
 * The ₹299 offer is "lifetime + 60 applications", so paying has to move the
 * user onto `legacy_lifetime` — otherwise someone who used up the free Apply
 * runs first would pay and stay blocked, because their entitlements row was
 * already created as `free`. Marking unpaid reverses it.
 *
 * Every payment path (webhook, reconcile, admin "Mark paid") funnels through
 * here, so this is the one place that needs to know.
 */
export async function setUserPaid(
  userId: string,
  paid: boolean,
): Promise<void> {
  await dbRun(
    `UPDATE users
        SET is_paid = ?,
            paid_at = CASE
              WHEN ? THEN COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
              ELSE NULL
            END,
            updated_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ?`,
    paid,
    paid,
    userId,
  );

  if (paid) {
    await dbRun(
      `INSERT INTO user_entitlements
         (user_id, plan, apply_credits, cv_credits, tailor_credits)
       VALUES (?, 'legacy_lifetime', 60, 9999, 9999)
       ON CONFLICT (user_id) DO UPDATE
         SET plan = 'legacy_lifetime',
             apply_credits = GREATEST(user_entitlements.apply_credits, 60),
             updated_at = (NOW() AT TIME ZONE 'utc')::text`,
      userId,
    );
  } else {
    // Refund / admin un-mark: back to the free tier, but never hand out a
    // fresh batch of credits they have already spent.
    await dbRun(
      `UPDATE user_entitlements
          SET plan = 'free',
              updated_at = (NOW() AT TIME ZONE 'utc')::text
        WHERE user_id = ? AND plan = 'legacy_lifetime'`,
      userId,
    );
  }
}

export async function setUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  await dbRun(
    `UPDATE users
        SET is_admin = ?,
            is_paid = CASE WHEN ? THEN true ELSE is_paid END,
            paid_at = CASE
              WHEN ? THEN COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
              ELSE paid_at
            END,
            updated_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ?`,
    isAdmin,
    isAdmin,
    isAdmin,
    userId,
  );
}

export function userHasPaidAccess(user: {
  is_admin: boolean;
  is_paid: boolean;
}): boolean {
  return Boolean(user.is_admin || user.is_paid);
}

export async function deleteAllUserSessions(userId: string) {
  await dbRun(`DELETE FROM sessions WHERE user_id = ?`, userId);
}

/**
 * Permanently deletes a user and related rows.
 * Explicit deletes first: live DBs may lack ON DELETE CASCADE on older FKs
 * (e.g. applications_user_id_fkey), and pending_extension_runs does not cascade.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM pending_extension_runs
      WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
         OR pipeline_run_id IN (SELECT id FROM pipeline_runs WHERE user_id = ${userId})
         OR pipeline_run_id IN (
              SELECT id FROM pipeline_runs
               WHERE application_id IN (
                 SELECT id FROM applications WHERE user_id = ${userId}
               )
            )
    `;

    // Clear non-cascading prompt_run refs before removing runs / applications.
    await tx`
      UPDATE resume_versions
         SET prompt_run_id = NULL
       WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
    `;
    await tx`
      UPDATE cover_letter_versions
         SET prompt_run_id = NULL
       WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
    `;
    await tx`
      UPDATE contacts
         SET prompt_run_id = NULL
       WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
    `;
    await tx`
      UPDATE emails
         SET prompt_run_id = NULL
       WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
    `;
    await tx`
      UPDATE follow_ups
         SET prompt_run_id = NULL
       WHERE prompt_run_id IN (SELECT id FROM prompt_runs WHERE user_id = ${userId})
    `;

    await tx`DELETE FROM pipeline_runs WHERE user_id = ${userId}`;
    await tx`
      DELETE FROM pipeline_runs
       WHERE application_id IN (SELECT id FROM applications WHERE user_id = ${userId})
    `;
    await tx`DELETE FROM applications WHERE user_id = ${userId}`;
    await tx`DELETE FROM prompt_runs WHERE user_id = ${userId}`;
    await tx`DELETE FROM users WHERE id = ${userId}`;
  });
}

export { destroySession };
