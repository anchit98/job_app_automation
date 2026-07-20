-- Resume prompt v17: enforce two-sentence bullet shape (not comma-chains)

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
  'resume_v17_gdoc',
  'resume',
  17,
  'Tailor Anchit Boruah''s resume for the job below. Layout is LOCKED — one page only.

Read REWRITE ANCHORS first. Every experience/projects bullet must be rewritten as TWO separate sentences in ONE JSON string.

NON-NEGOTIABLE — BULLET SENTENCE SHAPE (most common failure):
1. Each bullets[j] = ONE string with EXACTLY 2 sentences: "First sentence. Second sentence."
2. There MUST be a period + space in the MIDDLE of every bullet (two periods total inside the string).
3. NEVER write one long comma-chain sentence (e.g. "...prioritization, delivering 30% FTE..." is WRONG).
4. Use SENTENCE 1 and SENTENCE 2 under each anchor as your rewrite template — join with ". " when done.
5. Complete every bullet fully — never truncate mid-phrase.

OTHER RULES:
- experience[i] and projects[i] contain ONLY a "bullets" array — no company/title/dates fields.
- Never split one bullet into two array entries.
- skills[i] is ONE line — never wider than MAX width in anchors; swap items, never append.
- No markdown, no questions, no commentary — JSON only.

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
    { "bullets": ["Sentence one. Sentence two.", "..."] },
    { "bullets": ["...", "...", "...", "..."] },
    { "bullets": ["...", "..."] }
  ],
  "projects": [
    { "bullets": ["Sentence one. Sentence two."] },
    { "bullets": ["..."] },
    { "bullets": ["..."] }
  ],
  "skills": ["Category: item, item, ..."]
}',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v17 — two-sentence bullet shape; per-slot SENTENCE 1/2 anchors'
);
