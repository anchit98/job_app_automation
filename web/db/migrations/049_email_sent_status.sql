-- Let an email be marked as sent by the user.
--
-- draft_status was written for one flow: the app creates a Gmail draft through
-- the API, so "created" meant the draft exists and nothing after that was the
-- app's business. Sending a cold email from a compose deep link has no draft id
-- to record and no API call to observe, so without a state for it the pipeline
-- stage never completes, the timeline stays empty, and follow-ups are never
-- scheduled — the app simply never learns the email went out.
--
-- 'sent' is terminal and set by the user pressing "Mark as sent". It pairs with
-- the existing emails.sent_at column, which was declared but never written.

-- The original constraint was declared inline, so its name is whatever Postgres
-- generated. Drop it by what it covers rather than by a name we are guessing.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'emails'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%draft_status%'
  LOOP
    EXECUTE format('ALTER TABLE emails DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE emails ADD CONSTRAINT emails_draft_status_check CHECK (
  draft_status IN (
    'pending', 'creating', 'created', 'failed', 'deleted_externally', 'sent'
  )
);
