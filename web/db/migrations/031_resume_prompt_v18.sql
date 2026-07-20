-- Resume prompt v18: per-slot sentence count (1 or 2) + master width bands

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
  'resume_v18_gdoc',
  'resume',
  18,
  'Tailor Anchit Boruah''s resume for the job below. Layout is LOCKED — one page only.

Read REWRITE ANCHORS first. Each bullets[j] slot shows MASTER text, sentence count (1 or 2), and width band — match all three.

NON-NEGOTIABLE:
1. Match the sentence count per slot — some slots are 1 sentence (comma-flow like MASTER), others are 2 ("First. Second.").
2. Match the width band for each slot — short Annalect lines stay ~90 width; long WPP/project lines stay ~180-285 width.
3. experience[i] / projects[i] contain ONLY "bullets" arrays — no company/title/dates.
4. Complete every bullet — never truncate mid-phrase (never end with "and", "by", or a comma).
5. skills[i]: swap items only, never append; stay within MAX width.
6. JSON only — no markdown, no questions.

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
  'Phase 2c: v18 — per-slot 1 vs 2 sentences; master-calibrated width bands'
);
