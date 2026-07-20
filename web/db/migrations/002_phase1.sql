-- Phase 1: Job intake & application records

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  company TEXT,
  role TEXT,
  job_url TEXT,
  jd_raw TEXT NOT NULL,
  jd_parsed TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'ready',
      'applied',
      'email_sent',
      'hr_replied',
      'interview_scheduled',
      'rejected',
      'offer',
      'accepted',
      'withdrawn'
    )
  ),
  notes TEXT,
  language TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX applications_status_created_idx
  ON applications (status, created_at DESC);

CREATE TRIGGER applications_updated_at
AFTER UPDATE ON applications
BEGIN
  UPDATE applications SET updated_at = datetime('now') WHERE id = NEW.id;
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
  'jd_parse_v1',
  'jd_parse',
  1,
  'You are extracting structured fields from a job description for a job-application automation tool.

{{jd_wrapped}}

Respond with ONLY valid JSON matching this schema — no markdown, no prose before or after:
{
  "company": "string",
  "role": "string",
  "seniority": "string",
  "must_have_keywords": ["string"],
  "nice_to_have_keywords": ["string"],
  "responsibilities": ["string"],
  "requirements": ["string"],
  "tech_stack": ["string"],
  "location": "string",
  "remote_policy": "string"
}

Use an empty string or empty array when a field cannot be determined from the JD.',
  '["jd_wrapped"]',
  '{"type":"object","properties":{"company":{"type":"string"},"role":{"type":"string"},"seniority":{"type":"string"},"must_have_keywords":{"type":"array","items":{"type":"string"}},"nice_to_have_keywords":{"type":"array","items":{"type":"string"}},"responsibilities":{"type":"array","items":{"type":"string"}},"requirements":{"type":"array","items":{"type":"string"}},"tech_stack":{"type":"array","items":{"type":"string"}},"location":{"type":"string"},"remote_policy":{"type":"string"}}}',
  1,
  'Phase 1 optional JD parse template'
);
