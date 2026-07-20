-- Resume prompt v19: avoid output truncation (token limit)

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
  'resume_v19_gdoc',
  'resume',
  19,
  'Tailor Anchit Boruah''s resume for the job below. Layout is LOCKED — one page only.

CRITICAL — OUTPUT MUST FIT IN ONE REPLY:
ChatGPT often cuts off mid-JSON. You MUST return the COMPLETE JSON object in one message.
- Stay near each slot''s MAX WORDS in REWRITE ANCHORS (Annalect bullets ~15-18 words).
- Do NOT pad bullets with extra clauses — swap JD keywords into master-length phrasing.
- End with the closing ] and } for skills and the root object.

Read REWRITE ANCHORS. Match sentence count (1 or 2), width band, and MAX WORDS per slot.

NON-NEGOTIABLE:
1. Every bullet ends with a period — never truncate mid-phrase ("and", "by", "through").
2. experience[i] / projects[i]: ONLY "bullets" arrays.
3. skills[i]: swap items only; stay within MAX width.
4. JSON only — no markdown, no questions.

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
REWRITE ANCHORS:
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
  'Phase 2c: v19 — anti-truncation; MAX WORDS per slot; complete JSON in one reply'
);
