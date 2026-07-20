-- Resume prompt v20: exact per-bullet word count from master Google Doc

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
  'resume_v20_gdoc',
  'resume',
  20,
  'Tailor Anchit Boruah''s resume for the job below. Layout is LOCKED — one page only.

PRIMARY RULE — WORD COUNT (from master Google Doc):
Each bullets[j] slot in REWRITE ANCHORS shows EXACTLY how many words that line has in the Google Doc.
Your rewritten bullet must contain EXACTLY that many words. One sentence or two is fine — only the total word count matters.

NON-NEGOTIABLE:
1. Match EXACT word count per slot (count whitespace-separated tokens).
2. experience[i] / projects[i]: ONLY "bullets" arrays.
3. skills[i]: swap items only; stay within MAX width.
4. Return COMPLETE JSON in one message — never truncate.
5. JSON only — no markdown, no questions.

HEADLINE: target role from JD + 1-2 must-have keywords.

===========================================
JD KEYWORDS:
===========================================
{{jd_keyword_brief}}

===========================================
MASTER RESUME JSON:
===========================================
{{master_resume_json}}

===========================================
REWRITE ANCHORS (exact word count per doc line):
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
  'Phase 2c: v20 — exact per-bullet word count from master doc; sentence shape optional'
);
