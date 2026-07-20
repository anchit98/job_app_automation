-- Resume prompt v25: surgical keyword swap — keep master text, do not rewrite

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
  'resume_v25_gdoc',
  'resume',
  25,
  'ATS keyword swap for Anchit Boruah''s resume — keep the master text; do NOT rewrite.

MODE: Surgical edit only. Start from each MASTER bullet/skill line verbatim. Change the fewest words needed so JD keywords appear where already true. If a keyword does not fit without inventing or restructuring, leave that line unchanged.

ALLOWED:
- Synonym / phrase swaps (e.g. "supervised" → "led" only if needed for a JD term)
- Insert a JD keyword into an existing clause when the fact is already in the master
- Skills: keep each "Category:" prefix; reorder or swap items after the colon for JD tools/terms
- Headline: set to JD role title + top keywords (outside word ceiling)

FORBIDDEN:
- Rewriting bullets for style or flow
- New metrics, companies, projects, or claims not in MASTER
- Restructuring sentences or changing meaning
- Dropping master metrics

WORD CEILING: Experience bullets + project bullets + skills ≤ 400 words total. Shorter is fine. Prefer leaving text unchanged over trimming for length.

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
  'Phase 2c: v25 — surgical keyword swap; no full rewrite; auto-approve flags'
);
