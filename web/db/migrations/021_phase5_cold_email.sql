-- Phase 5: Cold email generation + Gmail drafts

CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
  prompt_run_id TEXT REFERENCES prompt_runs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX emails_application_idx ON emails (application_id, created_at DESC);
CREATE INDEX emails_contact_idx ON emails (contact_id);
CREATE INDEX emails_draft_status_idx ON emails (draft_status);

-- Prevent two rows claiming the same Gmail draft id
CREATE UNIQUE INDEX emails_gmail_draft_id_unique
  ON emails (gmail_draft_id)
  WHERE gmail_draft_id IS NOT NULL;

CREATE TRIGGER emails_updated_at
AFTER UPDATE ON emails
BEGIN
  UPDATE emails SET updated_at = datetime('now') WHERE id = NEW.id;
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
  'cold_email_batch_v1',
  'cold_email',
  1,
  'You write personalized cold outreach emails for a job-application automation tool.

Candidate profile:
{{user_profile_json}}

Application:
- Company: {{target_company}}
- Role: {{target_role}}

Job description / context:
{{jd_content}}

Tailored resume (JSON — cite real facts only; never invent):
{{tailored_resume_json}}

Shared context from the candidate (hooks to personalize openings — university, mutual connections, posts, news):
{{shared_context}}

Contacts to write for (write exactly one email per contact; use the contact_id values verbatim):
{{contacts_json}}

Rules:
1. Structure each email: personalized opening → relevant experience from the resume → why this company → clear CTA (e.g. 15-min chat).
2. Opening sentence MUST be unique per contact and grounded in shared_context and/or that contact''s role/linkedin. Do not reuse the same opener.
3. Match tone to role_template:
   - hiring_manager / director_product / vp_product: peer-to-peer, outcome-focused
   - recruiter: clear fit summary, easy to forward
   - founder: concise, energy, why now
4. Keep each body under ~180 words. Plain markdown. No greeting placeholder like [Name] left unfilled.
5. Subject lines: specific, not spammy. Include role or company when natural.
6. Never leave placeholders like [COMPANY], {{name}}, or YOUR_NAME.

Respond with ONLY valid JSON matching this schema — no markdown fences, no prose:
{
  "emails": [
    {
      "contact_id": "string — must match an input contact_id",
      "subject": "string",
      "body_md": "string — markdown body including greeting and sign-off"
    }
  ]
}

Return one entry for every contact listed above. Do not omit any contact_id.',
  '["user_profile_json","target_company","target_role","jd_content","tailored_resume_json","shared_context","contacts_json"]',
  '{"type":"object","required":["emails"],"properties":{"emails":{"type":"array","items":{"type":"object","required":["contact_id","subject","body_md"],"properties":{"contact_id":{"type":"string"},"subject":{"type":"string"},"body_md":{"type":"string"}}}}}}',
  1,
  'Phase 5 batch cold-email template (≤5 contacts per run)'
);
