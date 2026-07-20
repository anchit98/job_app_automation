-- Resume prompt v16: slot-by-slot rewrite anchors (per-line master text + width)

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
  'resume_v16_gdoc',
  'resume',
  16,
  'Tailor Anchit Boruah''s resume for the job below. Layout is LOCKED — one page only.

Read REWRITE ANCHORS first. For every bullets[i] and skills[i] slot, rewrite the MASTER text shown there — same sentence count, same width band, same facts/metrics. Return ONLY the JSON at the end.

NON-NEGOTIABLE:
1. experience[i] and projects[i] contain ONLY a "bullets" array — no company/title/dates fields.
2. Each bullets[j] is ONE string with EXACTLY 2 sentences (two periods inside one string).
3. Never split one bullet into two array entries.
4. skills[i] is ONE line — never wider than the MAX width in anchors; swap items, never append.
5. No markdown, no questions, no commentary — JSON only.

HEADLINE: target role from JD + 1-2 must-have keywords.

===========================================
JD KEYWORDS (swap into existing phrasing):
===========================================
{{jd_keyword_brief}}

===========================================
MASTER RESUME JSON (source of truth for facts):
===========================================
{{master_resume_json}}

===========================================
REWRITE ANCHORS (match each slot — validator uses this):
===========================================
{{section_budgets}}

===========================================
RULES:
===========================================
{{rules_json}}

===========================================
JOB DESCRIPTION:
===========================================
{{jd_content}}

Return ONLY this JSON shape:
{
  "headline": "string",
  "experience": [
    { "bullets": ["sentence one. sentence two.", "..."] },
    { "bullets": ["...", "...", "...", "..."] },
    { "bullets": ["...", "..."] }
  ],
  "projects": [
    { "bullets": ["sentence one. sentence two."] },
    { "bullets": ["..."] },
    { "bullets": ["..."] }
  ],
  "skills": ["Category: item, item, ..."]
}',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v16 — per-slot rewrite anchors with master text and width bands'
);
