-- Resume Builder + freemium entitlements.
--
-- Two things land together because they are the same product change: the
-- builder gives users who have no CV a way to make one, and entitlements
-- decide how much of that (and of Apply) is free.
--
-- Grandfathering: everyone who already paid bought "lifetime + 60
-- applications". They are moved onto a `legacy_lifetime` plan that the credit
-- checks skip entirely, so the new free tier never takes anything away from
-- them. Only new signups land on `free`.

-- ---------------------------------------------------------------------------
-- Entitlements — one row per user, created lazily on first check.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- free | legacy_lifetime | starter | pro | enterprise
  plan TEXT NOT NULL DEFAULT 'free',
  -- Remaining credits. Ignored while plan = 'legacy_lifetime'.
  apply_credits INTEGER NOT NULL DEFAULT 4,
  cv_credits INTEGER NOT NULL DEFAULT 4,
  tailor_credits INTEGER NOT NULL DEFAULT 4,
  -- Lifetime counters, kept even when credits are topped up.
  applies_used INTEGER NOT NULL DEFAULT 0,
  cvs_generated INTEGER NOT NULL DEFAULT 0,
  tailors_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

-- Grandfather every existing paying user before the free tier can bite.
INSERT INTO user_entitlements (user_id, plan, apply_credits, cv_credits, tailor_credits)
SELECT id, 'legacy_lifetime', 60, 9999, 9999
FROM users
WHERE is_paid = true
ON CONFLICT (user_id) DO NOTHING;

-- Admins never hit a wall either.
INSERT INTO user_entitlements (user_id, plan, apply_credits, cv_credits, tailor_credits)
SELECT id, 'legacy_lifetime', 9999, 9999, 9999
FROM users
WHERE is_admin = true
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Builder profile — the structured CV a user fills in when they have no
-- resume to upload. Mirrors ResumeBuilderV2's UserProfileV2, keyed by our own
-- user id instead of a Clerk id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  professional_field TEXT NOT NULL DEFAULT 'general',
  -- Full UserProfileV2-shaped document (contact, education, experience,
  -- skills, projects, optional sections). Stored whole because the builder
  -- edits it as one form.
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

-- ---------------------------------------------------------------------------
-- Every generation is a new row — nothing is overwritten, so users keep full
-- version history (same guarantee the Mongo version gave).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_cv_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- original | tailored
  cv_type TEXT NOT NULL DEFAULT 'original',
  professional_field TEXT,
  latex_content TEXT,
  -- Snapshot of the profile at generation time, so an old version can be
  -- reopened even after the live profile moves on.
  profile_snapshot JSONB,
  -- Drive file of the rendered PDF; bytes are not kept in Postgres.
  drive_file_id TEXT,
  drive_pdf_url TEXT,
  -- Set once this version has been pushed into master_resume.
  synced_to_master_at TEXT,
  parent_version_id TEXT REFERENCES builder_cv_versions (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS builder_cv_versions_user_idx
  ON builder_cv_versions (user_id, created_at DESC);
