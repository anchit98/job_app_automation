-- Resume prompt v21: total word budget (WORK EXPERIENCE → SKILLS) + ATS keywords

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
  'resume_v21_gdoc',
  'resume',
  21,
  'Tailor Anchit Boruah''s resume for ATS — one page, locked layout.

PRIMARY RULE — TOTAL WORD BUDGET:
The master Google Doc has a fixed word count from WORK EXPERIENCE through SKILLS.
All experience bullets + project bullets + skills in your JSON must total EXACTLY the tailorable word count in SECTION BUDGETS.
Distribute words freely across bullets (no per-line limit). Sentence count does not matter.

ATS RULE — KEYWORDS:
Weave JD must-have keywords into bullets and skills wherever grounded in master resume facts.
Keep every metric and outcome. Swap phrasing, not numbers. Headline: JD role + top keywords.

===========================================
JD KEYWORDS (prioritize these):
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

Return ONLY complete JSON:
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
  'Phase 2c: v21 — total word budget WORK EXPERIENCE→SKILLS; ATS keyword focus'
);
