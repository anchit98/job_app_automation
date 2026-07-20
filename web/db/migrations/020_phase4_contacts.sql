-- Phase 4: Email discovery contacts

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  linkedin_url TEXT,
  company_domain TEXT,
  email TEXT,
  email_confidence REAL,
  email_source TEXT CHECK (
    email_source IN ('mailmeteor_manual', 'pattern_smtp', 'manual_entry')
  ),
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('valid', 'risky', 'unverified', 'no_email_available')
  ),
  notes TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX contacts_application_idx ON contacts (application_id, created_at DESC);

CREATE TRIGGER contacts_updated_at
AFTER UPDATE ON contacts
BEGIN
  UPDATE contacts SET updated_at = datetime('now') WHERE id = NEW.id;
END;
