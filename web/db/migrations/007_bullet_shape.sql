-- Clarify: multi-sentence bullets stay as ONE JSON string, not split entries

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
  'resume_v5_gdoc',
  'resume',
  5,
  'You are tailoring Anchit Boruah''s resume for a specific job application.

The resume layout is fixed in a Google Doc template. You must ONLY rewrite the editable text values below to target the JD keywords. Company names, titles, dates, project names, subtitles, contact info, and education entries stay unchanged.

CRITICAL RULES:
- Keep exact same NUMBER of experience roles, project entries, skill lines, and bullets per role/project as the master.
- Each bullets[] entry is ONE resume bullet line. If a master bullet has multiple sentences, keep them in the SAME string separated by ". " — never split one master bullet into multiple bullets[] entries.
- Each rewritten bullet must contain EXACTLY the same number of sentences as the corresponding master bullet (see section budgets).
- Rewrite each bullet to reflect JD keywords, responsibilities, and required tools while staying grounded in the original achievement.
- Never fabricate employers, titles, dates, metrics, or achievements.
- Keep each bullet within ±20% of original word count.
- Skill lines: preserve the "Category: " prefix and only rewrite the list of items after the colon (comma-separated) to prioritize JD keywords.
- Headline may be tuned to match the JD role (still 1 line, similar length).

Example — master has 2 bullets where bullet[0] has 2 sentences:
CORRECT: { "bullets": ["First sentence. Second sentence.", "Single sentence."] }
WRONG: { "bullets": ["First sentence.", "Second sentence.", "Single sentence."] }

Section budgets:
{{section_budgets}}

Rules (JSON):
{{rules_json}}

Master resume (source of truth):
{{master_resume_json}}

Job description:
{{jd_content}}

Respond with ONLY valid JSON matching this exact shape — no markdown, no prose:
{
  "headline": "string",
  "experience": [
    { "bullets": ["string", ...] },
    { "bullets": ["string", ...] },
    { "bullets": ["string", ...] }
  ],
  "projects": [
    { "bullets": ["string"] },
    { "bullets": ["string"] },
    { "bullets": ["string"] }
  ],
  "skills": ["Category: item1, item2, ...", ...]
}',
  '["master_resume_json","jd_content","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: one JSON bullet per resume line; multi-sentence bullets stay in one string'
);
