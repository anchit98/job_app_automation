-- Resume prompt v24: 400-word ceiling; WORK EXPERIENCE → SKILLS validated by word cap only

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
  'resume_v24_gdoc',
  'resume',
  24,
  'Tailor Anchit Boruah''s resume for ATS — one page, locked layout.

WORD CEILING: All experience bullets + project bullets + skills must total AT MOST 400 words. Shorter is fine. Our app auto-trims if slightly over on import.

ATS: Weave JD must-have keywords into bullets and skills. Keep every master metric. Headline: JD role + keywords.

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

Return ONLY complete JSON.',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v24 — 400-word ceiling; tailorable section validated by word cap only'
);
