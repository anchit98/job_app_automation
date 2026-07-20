-- Phase 3: Cover letter generation

ALTER TABLE applications ADD COLUMN company_blurb TEXT;

CREATE TABLE cover_letter_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  resume_version_id TEXT REFERENCES resume_versions (id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  drive_pdf_id TEXT,
  drive_docx_id TEXT,
  drive_doc_id TEXT,
  prompt_run_id TEXT REFERENCES prompt_runs (id),
  edited_from_version_id TEXT REFERENCES cover_letter_versions (id),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'ready', 'upload_failed')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, version)
);

CREATE INDEX cover_letter_versions_application_idx
  ON cover_letter_versions (application_id, version DESC);

UPDATE prompt_templates SET active = 0 WHERE kind = 'cover_letter';

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
  'cover_letter_v1',
  'cover_letter',
  1,
  'You are writing a personalized cover letter for a job application. Use ONLY facts from the tailored resume — do not invent employers, metrics, or achievements.

User profile:
{{user_profile_json}}

<target_company>
{{target_company}}
</target_company>

<target_role>
{{target_role}}
</target_role>

Job description:
{{jd_content}}

{{company_blurb_block}}

Tailored resume (source of truth for evidence — cite specific bullets):
{{tailored_resume_json}}

Instructions:
1. Write a professional cover letter in a warm, confident tone (not generic).
2. Structure exactly five sections in the JSON below.
3. In opening_hook and why_this_role, hook the reader with role-specific motivation.
4. evidence_points: provide 2–3 bullets. EACH must quote or closely paraphrase a specific achievement from the tailored resume (include a metric or outcome when present in the source).
5. why_this_company: connect the candidate to {{target_company}} using the JD and company blurb when available.
6. cta: clear, polite call to action (conversation or interview).
7. body: assemble the full letter as plain text with paragraph breaks (\\n\\n). Include a greeting using the hiring team or company name, all five sections as paragraphs, and a sign-off with the candidate''s name from the profile.
8. The company name "{{target_company}}" must appear at least once in the body.
9. Do not use unresolved placeholders like [COMPANY] or [NAME].

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "opening_hook": "string — first paragraph after greeting",
  "why_this_role": "string",
  "evidence_points": ["string", "string"],
  "why_this_company": "string",
  "cta": "string",
  "body": "string — full letter with greeting, paragraphs, and sign-off"
}',
  '["user_profile_json","target_company","target_role","jd_content","company_blurb_block","tailored_resume_json"]',
  '{"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}}',
  1,
  'Phase 3 cover letter generation'
);
