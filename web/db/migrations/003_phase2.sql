-- Phase 2: Resume generation

CREATE TABLE resume_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  drive_pdf_id TEXT,
  drive_docx_id TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  user_rating INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'ready', 'upload_failed')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, version)
);

CREATE INDEX resume_versions_application_idx
  ON resume_versions (application_id, version DESC);

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
  'resume_v1',
  'resume',
  1,
  'You are tailoring a resume for a specific job application. You must NEVER fabricate employers, titles, dates, or achievements that are not grounded in the master resume.

Rules (JSON):
{{rules_json}}

Master resume (source of truth — do not add employers, titles, or dates not listed here):
{{master_resume_json}}

Job description:
{{jd_content}}

Instructions:
1. Keep the exact same experience entries (company, title, start_date, end_date) as the master resume.
2. Rewrite bullets to emphasize keywords and responsibilities from the JD.
3. Update the summary for this role.
4. Reorder skills to prioritize JD-relevant skills.
5. Do not invent metrics or numbers not present in the source bullets.

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "summary": "string",
  "experience": [
    {
      "company": "string (must match master)",
      "title": "string (must match master)",
      "start_date": "string or omit",
      "end_date": "string or omit",
      "bullets": ["string"]
    }
  ],
  "skills": ["string"]
}',
  '["master_resume_json","jd_content","rules_json"]',
  '{"type":"object","required":["summary","experience","skills"],"properties":{"summary":{"type":"string"},"experience":{"type":"array","items":{"type":"object","required":["company","title","bullets"],"properties":{"company":{"type":"string"},"title":{"type":"string"},"start_date":{"type":"string"},"end_date":{"type":"string"},"bullets":{"type":"array","items":{"type":"string"}}}}},"skills":{"type":"array","items":{"type":"string"}}}}',
  1,
  'Phase 2 tailored resume generation'
);
