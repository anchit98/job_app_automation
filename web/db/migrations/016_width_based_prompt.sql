-- v14: width-based line fitting. The app now validates rendered WIDTH (not char count),
-- calibrated against the master doc. Prompt is simplified: anchor each bullet to its master
-- counterpart, keep ~2 lines, inject JD keywords.

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout_locked": true,
  "bullet_layout_version": 4,
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
  'resume_v14_gdoc',
  'resume',
  14,
  'You are tailoring Anchit Boruah''s resume for a specific job. The document layout is LOCKED and must stay on ONE PAGE. Your ONLY job: rewrite each bullet and skill line to weave in job-description keywords, while keeping the same visual length as the master.

Return your best JSON directly. Do NOT refuse or try to count characters — our app measures the rendered width of every line automatically and will send you a short fix list if anything is off.

===========================================
LOCKED STRUCTURE (never change these counts):
===========================================
- experience[0] WPP Media: 4 bullets
- experience[1] Annalect India (Omnicom Group): 4 bullets
- experience[2] Servetel Communications: 2 bullets
- projects[0] Groww Review Analyzer AI Agent: 1 bullet
- projects[1] RAG Chatbot: 1 bullet
- projects[2] Meta Campaign Activation (at WPP Media): 1 bullet
- skills: same number of category lines as master

===========================================
THE GOLDEN RULE — MATCH THE MASTER''S LENGTH:
===========================================
For EACH bullet, look at the corresponding master bullet and produce a rewrite of ROUGHLY THE SAME LENGTH (same number of words, within a word or two). The master is already sized to fit 2 lines on one page — if you match its length, your version fits too.

- Master bullet has 2 sentences? Keep 2 sentences, similar length.
- Master bullet has 1 sentence but is long (~30 words)? Split it into 2 sentences of the SAME total length.
- Master bullet is short (~15 words, 1 sentence)? Expand to 2 sentences totaling ~28-30 words (about double) — this is the ONLY case where you add length.

Never make a bullet longer than ~30 words. Extra words push the resume to a 2nd page.

===========================================
SKILL LINES — MUST STAY ON ONE LINE:
===========================================
- Keep each "Category:" prefix EXACTLY as in master.
- After the colon, reorder/rewrite items to front-load JD keywords.
- Keep the line about the SAME length as the master line. If you add a JD keyword, remove a weaker item so the line does not grow (a longer skill line wraps to 2 lines and breaks the page).

===========================================
JD KEYWORDS TO WEAVE IN (grounded, no fabrication):
===========================================
{{jd_keyword_brief}}

Where to place them:
- Headline: JD role title + 1-2 must-have keywords.
- Experience bullets: swap generic phrasing for JD verbs/keywords describing the SAME achievement.
- Project bullets: use JD tech-stack terms the project actually used.
- Skills: front-load JD must-have and tech-stack terms.

===========================================
MASTER RESUME (rewrite from these facts only):
===========================================
{{master_resume_json}}

===========================================
STRUCTURE REFERENCE:
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

Return ONLY this JSON — no markdown, no code fences, no commentary:
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
  'Phase 2c: v14 — width-based validation, match-the-master length rule, JD keyword focus'
);
