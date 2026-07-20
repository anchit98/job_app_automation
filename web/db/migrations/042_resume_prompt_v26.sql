-- Resume prompt v28: subheader/headline is surgical keyword swap only (no rewriting / no adding)

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
  'resume_v28_gdoc',
  'resume',
  28,
  'ATS keyword swap for Anchit Boruah''s resume — keep the master text; do NOT rewrite.

MODE: Surgical edit only. Start from each MASTER line verbatim (subheader/headline, bullets, skills). Change the fewest words needed so JD keywords appear where already true. If a keyword does not fit without inventing or lengthening, leave that line unchanged.

ALLOWED:
- Synonym / phrase swaps inside an existing clause
- Replace a word or short phrase with a JD term when the meaning stays the same
- Skills: keep each "Category:" prefix; reorder or swap items after the colon for JD tools/terms
- Subheader (headline): start from the MASTER headline; only replace words/phrases with JD terms — do NOT append new clauses or stack extra titles/keywords

FORBIDDEN:
- Rewriting for style or flow
- Adding words, titles, or keyword lists onto the subheader (e.g. do not turn a short tagline into "Role | Keyword | Keyword | Keyword")
- New metrics, companies, projects, or claims not in MASTER
- Restructuring sentences or changing meaning
- Dropping master metrics

WORD CEILING: Experience bullets + project bullets + skills ≤ 400 words total. Shorter is fine. Prefer leaving text unchanged over trimming for length. Subheader is outside this ceiling but must still stay the same length ± a few words (replace, do not expand).

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
  'Phase 2c: v28 — surgical swap for subheader/headline too; no append/rewrite'
)
ON CONFLICT(id) DO UPDATE SET
  body = excluded.body,
  notes = excluded.notes,
  active = 1,
  output_schema = excluded.output_schema,
  variables = excluded.variables;
