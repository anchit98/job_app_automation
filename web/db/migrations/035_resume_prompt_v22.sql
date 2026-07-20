-- Resume prompt v22: approximate length for LLM; exact count is server-side on paste

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
  'resume_v22_gdoc',
  'resume',
  22,
  'Tailor Anchit Boruah''s resume for ATS — one page, locked layout.

YOUR JOB: Rewrite for the job description. Return complete JSON. Do NOT refuse or ask for confirmation.

LENGTH: Stay close to the master''s overall word count (see SECTION BUDGETS). You do NOT need to hit an exact word total — our app automatically trims or pads length when the JSON is pasted back. Do not count words yourself.

ATS (primary): Weave JD must-have keywords into bullets and skills. Keep every metric from the master resume. Swap phrasing, not numbers. Headline: JD role + top keywords.

===========================================
JD KEYWORDS:
===========================================
{{jd_keyword_brief}}

===========================================
SECTION BUDGET + MASTER REFERENCE:
===========================================
{{section_budgets}}

===========================================
MASTER RESUME JSON:
===========================================
{{master_resume_json}}

===========================================
JOB DESCRIPTION:
===========================================
{{jd_content}}

Return ONLY complete JSON — no markdown, no questions, no commentary:
{
  "headline": "string",
  "experience": [
    { "bullets": ["...", "...", "...", "..."] },
    { "bullets": ["...", "...", "...", "..."] },
    { "bullets": ["...", "..."] }
  ],
  "projects": [
    { "bullets": ["..."] },
    { "bullets": ["..."] },
    { "bullets": ["..."] }
  ],
  "skills": ["Category: item, item, ..."]
}',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v22 — LLM writes approximate length; server fits exact word budget on paste'
);
