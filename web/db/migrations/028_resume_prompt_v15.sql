-- Resume prompt v15: strict one-page skills + width-aligned bullets

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
  'resume_v15_gdoc',
  'resume',
  15,
  'You are tailoring Anchit Boruah''s resume for a specific job. The document layout is LOCKED and must stay on ONE PAGE.

YOUR TASK: Rewrite headline, experience bullets, project bullets, and skill item lists. Return ONLY the JSON at the end — no questions, no commentary.

CRITICAL — SKILLS (most common page-break cause):
- Each skills[i] is ONE line in the Google Doc. If a line wraps, the resume goes to page 2.
- Keep each "Category:" prefix EXACTLY as in master.
- NEVER add skill items. Only REORDER or SWAP items after the colon.
- Each skill line must stay at or below the max width shown in STRUCTURE REFERENCE for that line.
- If you want a JD keyword in skills, REMOVE a weaker item of similar length first.

BULLETS:
- Match the master bullet''s rendered length (see STRUCTURE REFERENCE per bullet).
- Exactly 2 sentences per bullet, one JSON string each.
- Never exceed ~30 words per bullet.
- Weave JD keywords by swapping phrasing, not by adding clauses.

HEADLINE: JD role title + 1-2 must-have keywords.

===========================================
LOCKED STRUCTURE (never change counts):
===========================================
- experience[0] WPP Media: 4 bullets
- experience[1] Annalect India (Omnicom Group): 4 bullets
- experience[2] Servetel Communications: 2 bullets
- projects[0] Groww Review Analyzer AI Agent: 1 bullet
- projects[1] RAG Chatbot: 1 bullet
- projects[2] Meta Campaign Activation (at WPP Media): 1 bullet
- skills: same number of lines as master — one line each

===========================================
JD KEYWORDS (swap in, do not append):
===========================================
{{jd_keyword_brief}}

===========================================
MASTER RESUME (facts only — never fabricate):
===========================================
{{master_resume_json}}

===========================================
STRUCTURE REFERENCE (width limits — do not exceed):
===========================================
{{section_budgets}}

===========================================
RULES (JSON):
===========================================
{{rules_json}}

===========================================
JOB DESCRIPTION:
===========================================
{{jd_content}}

Return ONLY this JSON — no markdown fences:
{
  "headline": "string",
  "experience": [
    { "bullets": ["s1. s2.", "s1. s2.", "s1. s2.", "s1. s2."] },
    { "bullets": ["s1. s2.", "s1. s2.", "s1. s2.", "s1. s2."] },
    { "bullets": ["s1. s2.", "s1. s2."] }
  ],
  "projects": [
    { "bullets": ["s1. s2."] },
    { "bullets": ["s1. s2."] },
    { "bullets": ["s1. s2."] }
  ],
  "skills": ["Category: item1, item2, ...", ...]
}',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'Phase 2c: v15 — strict skills swap-only, width budgets in section_budgets'
);
