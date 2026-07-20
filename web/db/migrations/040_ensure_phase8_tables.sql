-- Ensure Phase 8 tables exist (039 may have been skipped if schema_migrations was ahead)

CREATE TABLE IF NOT EXISTS extension_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_stage TEXT,
  stages_json TEXT NOT NULL,
  contacts_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_application
  ON pipeline_runs(application_id);

CREATE TABLE IF NOT EXISTS pending_extension_runs (
  prompt_run_id TEXT PRIMARY KEY,
  pipeline_run_id TEXT,
  kind TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  chatgpt_url TEXT NOT NULL DEFAULT 'https://chat.openai.com/',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (prompt_run_id) REFERENCES prompt_runs(id),
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_extension_pending
  ON pending_extension_runs(status, created_at);
