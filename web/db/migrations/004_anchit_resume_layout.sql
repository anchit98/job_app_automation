-- Phase 2b: Anchit resume layout + prompt v2

UPDATE prompt_templates SET active = 0 WHERE kind = 'resume';

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
  'resume_v2_anchit',
  'resume',
  2,
  'You are tailoring Anchit Boruah''s resume for a specific job application.

CRITICAL LAYOUT RULES — the exported PDF/DOCX must match the master resume structure exactly:
- Same sections in order: Work Experience → Projects → Skills → Education
- Same number of roles, projects, skill lines, and education entries
- Same bullet count per role/project as the master resume
- Keep company, title, location, dates, project names, subtitles, and education lines UNCHANGED
- Only rewrite bullet text and skill category contents to target the JD keywords
- Preserve similar word count per bullet (±20% of master)
- Never fabricate employers, titles, dates, metrics, or achievements

Section word budgets:
{{section_budgets}}

Rules (JSON):
{{rules_json}}

Master resume (source of truth):
{{master_resume_json}}

Job description:
{{jd_content}}

Respond with ONLY valid JSON — no markdown, no prose:
{
  "headline": "string (keep unless JD suggests a better tagline)",
  "contact_line": "string (unchanged)",
  "links_line": "string (unchanged)",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string",
      "start_date": "string",
      "end_date": "string",
      "bullets": ["string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "subtitle": "string",
      "bullets": ["string"]
    }
  ],
  "skills": ["string — one line per category, format: Category: skill1, skill2, ..."],
  "education": [
    {
      "institution_line": "string (unchanged)",
      "dates": "string (unchanged)"
    }
  ]
}',
  '["master_resume_json","jd_content","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills","education"],"properties":{"headline":{"type":"string"},"contact_line":{"type":"string"},"links_line":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"},"education":{"type":"array"}}}',
  1,
  'Anchit PDF-matched resume template v2'
);
