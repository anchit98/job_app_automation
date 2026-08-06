-- Align user FKs with schema.sql so account deletion cascades reliably.
-- Older databases created applications.user_id without ON DELETE CASCADE.

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_user_id_fkey;

ALTER TABLE applications
  ADD CONSTRAINT applications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_user_id_fkey;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT pipeline_runs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_application_id_fkey;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT pipeline_runs_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE;
