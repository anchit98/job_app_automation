-- Phase 6: Tracker, search (FTS5), dashboard indexes, rich notes

ALTER TABLE applications ADD COLUMN notes_html TEXT;

CREATE VIRTUAL TABLE applications_fts USING fts5(
  application_id UNINDEXED,
  company,
  role,
  jd_raw,
  notes,
  tokenize = 'porter unicode61'
);

INSERT INTO applications_fts (application_id, company, role, jd_raw, notes)
SELECT id, COALESCE(company, ''), COALESCE(role, ''), jd_raw, COALESCE(notes, '')
FROM applications;

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity, entity_id, created_at DESC);

CREATE TRIGGER applications_fts_insert
AFTER INSERT ON applications
BEGIN
  INSERT INTO applications_fts (application_id, company, role, jd_raw, notes)
  VALUES (
    NEW.id,
    COALESCE(NEW.company, ''),
    COALESCE(NEW.role, ''),
    NEW.jd_raw,
    COALESCE(NEW.notes, '')
  );
END;

CREATE TRIGGER applications_fts_update
AFTER UPDATE ON applications
BEGIN
  DELETE FROM applications_fts WHERE application_id = OLD.id;
  INSERT INTO applications_fts (application_id, company, role, jd_raw, notes)
  VALUES (
    NEW.id,
    COALESCE(NEW.company, ''),
    COALESCE(NEW.role, ''),
    NEW.jd_raw,
    COALESCE(NEW.notes, '')
  );
END;

CREATE TRIGGER applications_fts_delete
AFTER DELETE ON applications
BEGIN
  DELETE FROM applications_fts WHERE application_id = OLD.id;
END;
