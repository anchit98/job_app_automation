/**
 * External sign-in identities — "Continue with Google".
 *
 * Kept separate from `users` because the two answer different questions: a
 * user row is who the account belongs to, an identity row is how someone
 * proved they are them. One user can accumulate several identities (and, once
 * they set a password, a credential as well) without any of them being the
 * account.
 *
 * Matching is by the provider's own subject id, never by email alone. An email
 * address can be reassigned by whoever runs the domain; a Google `sub` cannot
 * be. The address is only used once, to attach a *new* identity to an existing
 * password account, and only when the provider says it is verified.
 */
import { randomUUID } from "crypto";
import { dbGet, dbRun } from "@/lib/db";

export type IdentityProvider = "google";

export interface UserIdentity {
  id: string;
  user_id: string;
  provider: IdentityProvider;
  provider_account_id: string;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
}

/** The account this external login already belongs to, if any. */
export async function findUserIdByIdentity(
  provider: IdentityProvider,
  providerAccountId: string,
): Promise<string | null> {
  const row = (await dbGet(
    `SELECT user_id FROM user_identities
      WHERE provider = ? AND provider_account_id = ?`,
    provider,
    providerAccountId,
  )) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

/**
 * Attach an external login to a user, or refresh the one already attached.
 *
 * The unique index is on (provider, provider_account_id), so a second user
 * cannot claim the same Google account — the conflict updates the existing row
 * rather than creating a rival. There is a second unique index on
 * (user_id, provider), which is what stops one user linking two Google
 * accounts; that one is left to fail loudly, because it means the caller
 * matched the wrong user.
 */
export async function linkIdentity(input: {
  userId: string;
  provider: IdentityProvider;
  providerAccountId: string;
  email?: string | null;
}): Promise<void> {
  await dbRun(
    `INSERT INTO user_identities
       (id, user_id, provider, provider_account_id, email, last_login_at)
     VALUES (?, ?, ?, ?, ?, ((NOW() AT TIME ZONE 'utc')::text))
     ON CONFLICT (provider, provider_account_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       last_login_at = ((NOW() AT TIME ZONE 'utc')::text)`,
    randomUUID(),
    input.userId,
    input.provider,
    input.providerAccountId,
    input.email?.trim().toLowerCase() ?? null,
  );
}

/**
 * Does this account have a usable password?
 *
 * False for accounts created through Google that never set one. Password
 * sign-in has to check this before comparing hashes, or a social-only user
 * gets "invalid email or password" for a password they never had.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  const row = (await dbGet(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  )) as { password_hash: string | null } | undefined;
  return Boolean(row?.password_hash);
}

/** Which providers this user can sign in with, for the settings screen. */
export async function listIdentityProviders(
  userId: string,
): Promise<IdentityProvider[]> {
  const rows = (await dbGet(
    `SELECT string_agg(provider, ',') AS providers
       FROM user_identities WHERE user_id = ?`,
    userId,
  )) as { providers: string | null } | undefined;
  return (rows?.providers ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as IdentityProvider[];
}
