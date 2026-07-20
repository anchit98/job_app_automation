-- Lock bullet layout structure and add JD keyword brief to resume prompt.

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout_locked": true,
  "bullet_layout_version": 1,
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
  'resume_v8_gdoc',
  'resume',
  8,
  'You are tailoring Anchit Boruah''s resume for a specific job application.

The resume layout is LOCKED. You must ONLY rewrite editable text values to target the job description. Company names, titles, dates, project names, subtitles, contact info, and education entries stay unchanged.

LOCKED STRUCTURE (never change):
- WPP Media: 4 bullets × 2 sentences × 200-240 chars each
- Annalect India (Omnicom Group): 4 bullets × 2 sentences × 200-240 chars each
- Servetel Communications: 2 bullets × 2 sentences × 200-240 chars each
- Groww Review Analyzer AI Agent: 1 bullet × 2 sentences × 200-240 chars
- RAG Chatbot: 1 bullet × 2 sentences × 200-240 chars
- Meta Campaign Activation (at WPP Media): 1 bullet × 2 sentences × 200-240 chars

LINE FIT (hard constraint):
- Every bullet MUST render as EXACTLY 2 lines in the Google Doc.
- Length 200-240 characters per bullet (target ~220). Count characters including spaces.
- Bullets < 200 chars render as 1 line — REJECTED.
- Bullets > 240 chars overflow to a 3rd line — REJECTED.

JD KEYWORD TAILORING (required):
{{jd_keyword_brief}}

Keyword placement rules:
- Headline: mirror the JD role title and 1-2 must-have keywords when grounded.
- Experience bullets: weave must-have keywords and top responsibilities into WPP/Annalect/Servetel bullets.
- Project bullets: align Groww/RAG/Meta bullets with JD tech stack and product themes where grounded.
- Skills lines: reorder and rewrite items after each "Category: " prefix to front-load JD must-have and tech-stack terms.
- Include at least 70% of must-have JD keywords somewhere across headline + bullets + skills.
- Never fabricate experience to match keywords — only rephrase grounded master-resume facts.

Section budgets:
{{section_budgets}}

Rules (JSON):
{{rules_json}}

Master resume (source of truth for facts):
{{master_resume_json}}

Full job description:
{{jd_content}}

BEFORE RETURNING JSON:
1. Verify every bullet is 200-240 chars and has exactly 2 sentences in one string.
2. Verify at least 70% of must-have JD keywords appear in headline, bullets, or skills.
3. Only then return the JSON.

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
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: locked layout + JD keyword brief'
);
