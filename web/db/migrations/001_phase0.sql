-- Phase 0: local SQLite schema (single-user, no app login)

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT,
  headline TEXT,
  location TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  drive_root_id TEXT,
  preferred_tone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE master_resume (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL DEFAULT '{}',
  rules TEXT NOT NULL DEFAULT '{"never_fabricate": true}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  output_schema TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, version)
);

CREATE TABLE prompt_runs (
  id TEXT PRIMARY KEY,
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
  exported_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  raw_response TEXT,
  parsed_response TEXT,
  validation_errors TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX prompt_runs_status_exported_idx
  ON prompt_runs (status, exported_at DESC);

CREATE TABLE google_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

CREATE TRIGGER profiles_updated_at
AFTER UPDATE ON profiles
BEGIN
  UPDATE profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER master_resume_updated_at
AFTER UPDATE ON master_resume
BEGIN
  UPDATE master_resume SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER google_tokens_updated_at
AFTER UPDATE ON google_tokens
BEGIN
  UPDATE google_tokens SET updated_at = datetime('now') WHERE id = NEW.id;
END;

INSERT INTO prompt_templates (
  id,
  kind,
  version,
  body,
  variables,
  output_schema,
  active,
  notes
)
VALUES (
  'hello_world_v1',
  'hello_world',
  1,
  'You are helping test a job-application automation pipeline.

The user''s name is: {{name}}

Respond with ONLY valid JSON matching this schema — no markdown, no prose before or after:
{
  "greeting": "string — a one-sentence friendly greeting using the user''s name",
  "echo": "string — repeat back the name exactly as provided"
}',
  '["name"]',
  '{"type":"object","required":["greeting","echo"],"properties":{"greeting":{"type":"string"},"echo":{"type":"string"}}}',
  1,
  'Phase 0 demo round-trip template'
);
