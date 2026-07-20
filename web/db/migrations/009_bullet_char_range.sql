-- Anchit resume: bullets must render as exactly 2 lines in the Google Doc.
-- Enforce character-length ranges tuned for a 2-line bullet in Calibri 10pt.

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout": {
    "experience": [
      { "label": "WPP Media", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 },
      { "label": "Annalect India (Omnicom Group)", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 },
      { "label": "Servetel Communications", "bullets": 2, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 }
    ],
    "projects": [
      { "label": "Groww Review Analyzer AI Agent", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 },
      { "label": "RAG Chatbot", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 },
      { "label": "Meta Campaign Activation (at WPP Media)", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 200, "max_chars": 240 }
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
  'resume_v7_gdoc',
  'resume',
  7,
  'You are tailoring Anchit Boruah''s resume for a specific job application.

The resume layout is fixed in a Google Doc template. You must ONLY rewrite the editable text values below to target the JD keywords. Company names, titles, dates, project names, subtitles, contact info, and education entries stay unchanged.

CRITICAL RULES — LINE FIT IS MANDATORY:
- Every bullet MUST render as EXACTLY 2 lines in the Google Doc. This is achieved by keeping each bullet between 200 and 240 characters (target ~220).
- Bullets shorter than 200 chars will render as 1 line — REJECTED.
- Bullets longer than 240 chars will overflow to a 3rd line — REJECTED.
- Count characters including spaces and punctuation. Do NOT count HTML/markdown.

STRUCTURE RULES:
- Follow the MANDATORY OUTPUT BULLET SHAPE in section budgets exactly.
- WPP Media: 4 bullets, each exactly 2 sentences in ONE string, 200-240 chars.
- Annalect India (Omnicom Group): 4 bullets, each exactly 2 sentences in ONE string, 200-240 chars.
- Servetel Communications: 2 bullets, each exactly 2 sentences in ONE string, 200-240 chars.
- Groww Review Analyzer AI Agent: 1 bullet, exactly 2 sentences in ONE string, 200-240 chars.
- RAG Chatbot: 1 bullet, exactly 2 sentences in ONE string, 200-240 chars.
- Meta Campaign Activation (at WPP Media): 1 bullet, exactly 2 sentences in ONE string, 200-240 chars.
- Never split one bullet into multiple bullets[] entries — put both sentences in the same string, separated by ". ".

CONTENT RULES:
- Rewrite each bullet to reflect JD keywords, responsibilities, and required tools while staying grounded in the original achievement.
- Never fabricate employers, titles, dates, metrics, or achievements.
- If the master bullet is shorter than 200 chars, EXPAND with a second sentence that adds JD-aligned context (tools, scope, outcomes) grounded in the master facts.
- If the master bullet is longer than 240 chars, TIGHTEN wording while keeping all facts, metrics, and both sentences.
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

BEFORE RETURNING JSON: for every bullet, count its characters. If any bullet is < 200 or > 240 chars, rewrite it. Only return the JSON once every bullet is 200-240 chars.

Respond with ONLY valid JSON matching this exact shape — no markdown, no prose:
{
  "headline": "string",
  "experience": [
    { "bullets": ["string", "string", "string", "string"] },
    { "bullets": ["string", "string", "string", "string"] },
    { "bullets": ["string", "string"] }
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
  'Phase 2c: 200-240 char range per bullet for exact 2-line fit'
);
