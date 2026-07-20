-- Phase 7: Follow-up engine

CREATE TABLE follow_ups (
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email_id, sequence)
);

CREATE INDEX follow_ups_due_status_idx
  ON follow_ups (status, due_at);

CREATE INDEX follow_ups_application_idx
  ON follow_ups (application_id, sequence);

CREATE TRIGGER follow_ups_updated_at
AFTER UPDATE ON follow_ups
BEGIN
  UPDATE follow_ups SET updated_at = datetime('now') WHERE id = NEW.id;
END;

UPDATE prompt_templates SET active = 0 WHERE kind = 'follow_up';

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
  'follow_up_v1',
  'follow_up',
  1,
  'You write a short, professional follow-up email for a job application. The candidate already sent an initial cold email and has not received a reply.

Candidate profile:
{{user_profile_json}}

Application:
- Company: {{target_company}}
- Role: {{target_role}}

Job description / context:
{{jd_content}}

Application notes (recent updates from the candidate):
{{application_notes}}

Original cold email (do not repeat verbatim — add a light bump):
Subject: {{original_subject}}
---
{{original_body_md}}

Contact:
{{contact_json}}

This is follow-up #{{follow_up_sequence}} (1 = first bump after ~5 business days; 2 = second bump after ~10 business days from the first follow-up).

Rules:
1. Keep under ~120 words. Plain markdown with greeting and sign-off (app may append signature in Gmail).
2. Reference the original outreach briefly; add one new angle from the resume or notes if available.
3. No placeholders like [COMPANY] or {{name}}.
4. Subject should read as a reply thread when natural (e.g. "Re: …" or a short bump subject).

Respond with ONLY valid JSON — no markdown fences:
{
  "subject": "string",
  "body_md": "string"
}',
  '["user_profile_json","target_company","target_role","jd_content","application_notes","original_subject","original_body_md","contact_json","follow_up_sequence"]',
  '{"type":"object","required":["subject","body_md"],"properties":{"subject":{"type":"string"},"body_md":{"type":"string"}}}',
  1,
  'Phase 7 single follow-up email'
);
