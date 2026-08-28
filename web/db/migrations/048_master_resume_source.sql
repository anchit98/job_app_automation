-- Record WHERE the master resume came from.
--
-- Before this, the only "in use" signal was builder_cv_versions.synced_to_master_at,
-- which is a one-way stamp: once a built CV had been pushed to master it kept
-- claiming "In use" forever, even after the user replaced their master with a
-- Drive pick or a device upload. The truth belongs on master_resume itself —
-- one row, one current source.
--
-- source: builder | device_upload | drive_file | google_doc | manual
-- source_label: what to show the user (file name, "Technology CV", Doc title)
-- source_ref: builder version id / Drive file id / Doc id, for exact matching

ALTER TABLE master_resume ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE master_resume ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE master_resume ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- Best-effort backfill for rows that predate the column: a builder CV that was
-- pushed to master and never superseded is the only source we can infer.
UPDATE master_resume mr
   SET source = 'builder',
       source_label = COALESCE(
         NULLIF(initcap(latest.professional_field), ''), 'Built in app'),
       source_ref = latest.id
  FROM (
    SELECT DISTINCT ON (user_id) user_id, id, professional_field, synced_to_master_at
      FROM builder_cv_versions
     WHERE synced_to_master_at IS NOT NULL
     ORDER BY user_id, synced_to_master_at DESC
  ) latest
 WHERE mr.user_id = latest.user_id
   AND mr.source IS NULL;
