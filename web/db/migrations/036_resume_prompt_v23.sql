-- Resume prompt v23: word cap (max only) — under budget is fine

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
  'resume_v23_gdoc',
  'resume',
  23,
  'Tailor Anchit Boruah''s resume for ATS — one page, locked layout.

YOUR JOB: Rewrite for the JD. Return complete JSON. Do NOT refuse or ask for confirmation.

LENGTH CAP: Stay at or under the master word total in SECTION BUDGETS (~454 words across all bullets + skills). Shorter is fine — only going OVER risks a page break. Our app auto-trims if slightly over on import. Do not count words yourself.

ATS (primary): Weave JD must-have keywords into bullets and skills. Keep every metric from master. Headline: JD role + keywords.

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

Return ONLY complete JSON:
{
  "headline": "string",
  "experience": [{ "bullets": ["...", "..."] }],
  "projects": [{ "bullets": ["..."] }],
  "skills": ["Category: item, item, ..."]
}',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v23 — max word cap only; under budget passes'
);
