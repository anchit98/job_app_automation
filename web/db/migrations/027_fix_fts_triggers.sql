-- Fix FTS5 triggers: normal FTS tables must use SQL DELETE, not the FTS 'delete' command
-- (the 'delete' command is only for external-content / contentless tables).

DROP TRIGGER IF EXISTS applications_fts_update;
DROP TRIGGER IF EXISTS applications_fts_delete;

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

-- Rebuild search index after fixing triggers.
DELETE FROM applications_fts;

INSERT INTO applications_fts (application_id, company, role, jd_raw, notes)
SELECT id, COALESCE(company, ''), COALESCE(role, ''), jd_raw, COALESCE(notes, '')
FROM applications;

DROP TRIGGER IF EXISTS applications_updated_at;

CREATE TRIGGER applications_updated_at
AFTER UPDATE ON applications
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE applications SET updated_at = datetime('now') WHERE id = NEW.id;
END;
