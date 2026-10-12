-- Sign in with Google.
--
-- Two changes, both of which exist because an account can now be created
-- without anyone choosing a password.
--
-- 1. `users.password_hash` becomes nullable. A social account has no password
--    and must not be given a fake one: a random hash would look exactly like a
--    real credential to every check that reads the column, and "this account
--    has no password" is the fact that has to survive — it is what stops
--    password sign-in from silently failing with "wrong password" on an
--    account that never had one.
--
-- 2. `user_identities` records which external account a user signed in with.
--    Keyed by (provider, provider_account_id) rather than by email, because
--    an email address can be reassigned and a Google subject id cannot. The
--    email is stored alongside it only so an admin can see what was matched.
--
-- Linking by verified email is deliberate: someone who already signed up with
-- a password and later clicks "Continue with Google" gets their existing
-- account, not a second one. Google asserts the address is verified, which is
-- the whole basis for trusting the match — an unverified address must never
-- take over an account.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- google | github | ... — one row per provider per user.
  provider TEXT NOT NULL,
  -- The provider's own stable id for the account (Google's `sub`).
  provider_account_id TEXT NOT NULL,
  -- What the provider said the address was at link time, for support lookups.
  email TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  last_login_at TEXT
);

-- One external account maps to exactly one user.
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_account_idx
  ON user_identities (provider, provider_account_id);

-- And one user links each provider at most once.
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_user_provider_idx
  ON user_identities (user_id, provider);
