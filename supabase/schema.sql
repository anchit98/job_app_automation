-- ApplyForge / Job Application Automation — Supabase Postgres schema
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where practical.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  must_reset_password BOOLEAN NOT NULL DEFAULT false,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx
  ON password_reset_requests (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('forgot_password', 'admin_reset')),
  issued_by_admin_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  upi_reference TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_admin_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS payment_claims_user_idx
  ON payment_claims (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_claims_status_idx
  ON payment_claims (status, created_at DESC);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  full_name TEXT,
  headline TEXT,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  drive_root_id TEXT,
  preferred_tone TEXT,
  phone TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  setup_console_done_at TEXT,
  setup_guide_collapsed BOOLEAN NOT NULL DEFAULT false,
  avatar_data TEXT,
  avatar_mime TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS master_resume (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '{}',
  rules TEXT NOT NULL DEFAULT '{"never_fabricate": true}',
  doc_id TEXT,
  doc_layout TEXT,
  doc_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS master_cover_letter (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  doc_id TEXT,
  doc_layout TEXT,
  doc_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  output_schema TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  UNIQUE (kind, version)
);

CREATE TABLE IF NOT EXISTS prompt_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'hello_world',
      'jd_parse',
      'resume',
      'cover_letter',
      'cold_email',
      'follow_up',
      'repair',
      'email_discovery'
    )
  ),
  prompt_text TEXT NOT NULL,
  target_entity TEXT,
  target_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'completed', 'abandoned')
  ),
  exported_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  completed_at TEXT,
  raw_response TEXT,
  parsed_response TEXT,
  validation_errors TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS prompt_runs_status_exported_idx
  ON prompt_runs (status, exported_at DESC);
CREATE INDEX IF NOT EXISTS prompt_runs_user_idx ON prompt_runs (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_runs_one_pending_stage_idx
  ON prompt_runs (kind, target_entity_id)
  WHERE status = 'pending'
    AND target_entity_id IS NOT NULL
    AND kind IN ('jd_parse', 'resume', 'cover_letter');

CREATE TABLE IF NOT EXISTS google_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  company TEXT,
  role TEXT,
  job_url TEXT,
  jd_raw TEXT NOT NULL,
  jd_parsed TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'ready',
      'applied',
      'email_sent',
      'hr_replied',
      'interview_scheduled',
      'rejected',
      'offer',
      'accepted',
      'withdrawn'
    )
  ),
  notes TEXT,
  notes_html TEXT,
  language TEXT,
  company_blurb TEXT,
  email_instructions TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS applications_status_created_idx
  ON applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_user_idx ON applications (user_id);

CREATE TABLE IF NOT EXISTS resume_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  drive_pdf_id TEXT,
  drive_docx_id TEXT,
  drive_doc_id TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  user_rating INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'ready', 'upload_failed')
  ),
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  UNIQUE (application_id, version)
);

CREATE INDEX IF NOT EXISTS resume_versions_application_idx
  ON resume_versions (application_id, version DESC);

CREATE TABLE IF NOT EXISTS cover_letter_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  resume_version_id TEXT REFERENCES resume_versions (id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  drive_pdf_id TEXT,
  drive_docx_id TEXT,
  drive_doc_id TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  edited_from_version_id TEXT REFERENCES cover_letter_versions (id),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'ready', 'upload_failed')
  ),
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  UNIQUE (application_id, version)
);

CREATE INDEX IF NOT EXISTS cover_letter_versions_application_idx
  ON cover_letter_versions (application_id, version DESC);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  linkedin_url TEXT,
  company_domain TEXT,
  email TEXT,
  email_confidence DOUBLE PRECISION,
  email_source TEXT CHECK (
    email_source IN ('mailmeteor_manual', 'pattern_smtp', 'manual_entry')
  ),
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('valid', 'risky', 'unverified', 'no_email_available')
  ),
  notes TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS contacts_application_idx
  ON contacts (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cold' CHECK (kind IN ('cold', 'follow_up')),
  subject TEXT NOT NULL,
  body_md TEXT NOT NULL,
  body_html TEXT NOT NULL,
  role_template TEXT,
  gmail_draft_id TEXT,
  gmail_message_id TEXT,
  draft_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    draft_status IN ('pending', 'creating', 'created', 'failed', 'deleted_externally')
  ),
  draft_error TEXT,
  sent_at TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS emails_application_idx ON emails (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS emails_contact_idx ON emails (contact_id);
CREATE INDEX IF NOT EXISTS emails_draft_status_idx ON emails (draft_status);
CREATE UNIQUE INDEX IF NOT EXISTS emails_gmail_draft_id_unique
  ON emails (gmail_draft_id)
  WHERE gmail_draft_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS emails_one_cold_per_contact
  ON emails (application_id, contact_id)
  WHERE kind = 'cold';

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  email_id TEXT NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence IN (1, 2)),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'waiting',
      'pending',
      'processing',
      'enqueued',
      'snoozed',
      'skipped',
      'sent'
    )
  ),
  snoozed_until TEXT,
  draft_email_id TEXT REFERENCES emails (id),
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  sent_at TEXT,
  notes TEXT,
  processing_started_at TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  UNIQUE (email_id, sequence)
);

CREATE INDEX IF NOT EXISTS follow_ups_application_idx
  ON follow_ups (application_id, sequence);
CREATE INDEX IF NOT EXISTS follow_ups_due_status_idx
  ON follow_ups (status, due_at);

CREATE TABLE IF NOT EXISTS extension_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  current_stage TEXT,
  stages_json TEXT NOT NULL,
  contacts_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_application
  ON pipeline_runs (application_id);
CREATE INDEX IF NOT EXISTS pipeline_runs_user_idx ON pipeline_runs (user_id);

CREATE TABLE IF NOT EXISTS pending_extension_runs (
  prompt_run_id TEXT PRIMARY KEY REFERENCES prompt_runs (id),
  pipeline_run_id TEXT REFERENCES pipeline_runs (id),
  kind TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  chatgpt_url TEXT NOT NULL DEFAULT 'https://chat.openai.com/',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  wake_until TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  updated_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
);

CREATE INDEX IF NOT EXISTS idx_pending_extension_pending
  ON pending_extension_runs (status, created_at);

CREATE INDEX IF NOT EXISTS applications_search_idx ON applications
  USING GIN (
    to_tsvector(
      'english',
      coalesce(company, '') || ' ' ||
      coalesce(role, '') || ' ' ||
      coalesce(jd_raw, '') || ' ' ||
      coalesce(notes, '')
    )
  );

INSERT INTO schema_migrations (version) VALUES (45)
ON CONFLICT (version) DO NOTHING;
