-- Anchit resume: explicit bullet + sentence layout rules

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout": {
    "experience": [
      { "label": "WPP Media", "bullets": 4, "sentences_per_bullet": 2 },
      { "label": "Annalect India (Omnicom Group)", "bullets": 4, "sentences_per_bullet": 2 },
      { "label": "Servetel Communications", "bullets": 2, "sentences_per_bullet": 2 }
    ],
    "projects": [
      { "label": "Groww Review Analyzer AI Agent", "bullets": 1, "sentences_per_bullet": 2 },
      { "label": "RAG Chatbot", "bullets": 1, "sentences_per_bullet": 2 },
      { "label": "Meta Campaign Activation (at WPP Media)", "bullets": 1, "sentences_per_bullet": 2 }
    ]
  }
}')
WHERE id = 1;

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
  'resume_v6_gdoc',
  'resume',
  6,
  'You are tailoring Anchit Boruah''s resume for a specific job application.

The resume layout is fixed in a Google Doc template. You must ONLY rewrite the editable text values below to target the JD keywords. Company names, titles, dates, project names, subtitles, contact info, and education entries stay unchanged.

CRITICAL RULES:
- Follow the MANDATORY OUTPUT BULLET SHAPE in section budgets exactly.
- WPP Media: 4 bullets, each with exactly 2 sentences in one string.
- Annalect India (Omnicom Group): 4 bullets, each with exactly 2 sentences in one string.
- Servetel Communications: 2 bullets, each with exactly 2 sentences in one string.
- Groww Review Analyzer AI Agent: 1 bullet with exactly 2 sentences in one string.
- RAG Chatbot: 1 bullet with exactly 2 sentences in one string.
- Meta Campaign Activation (at WPP Media): 1 bullet with exactly 2 sentences in one string.
- Each bullets[] entry is ONE resume bullet line. Never split one bullet into multiple bullets[] entries.
- If a master bullet currently has 1 sentence, expand it to 2 sentences while preserving all facts and metrics.
- Rewrite each bullet to reflect JD keywords, responsibilities, and required tools while staying grounded in the original achievement.
- Never fabricate employers, titles, dates, metrics, or achievements.
- Keep each bullet within ±20% of original word count (expand wording when adding a second sentence).
- Skill lines: preserve the "Category: " prefix and only rewrite the list of items after the colon (comma-separated) to prioritize JD keywords.
- Headline may be tuned to match the JD role (still 1 line, similar length).

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
  'Phase 2c: Anchit bullet layout — 2 sentences per bullet everywhere'
);
