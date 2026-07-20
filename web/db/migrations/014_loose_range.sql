-- v12: loosen char range to 180-260 (matches master doc empirically) so LLM overshoots pass.

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout_locked": true,
  "bullet_layout_version": 2,
  "bullet_layout": {
    "experience": [
      { "label": "WPP Media", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 },
      { "label": "Annalect India (Omnicom Group)", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 },
      { "label": "Servetel Communications", "bullets": 2, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 }
    ],
    "projects": [
      { "label": "Groww Review Analyzer AI Agent", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 },
      { "label": "RAG Chatbot", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 },
      { "label": "Meta Campaign Activation (at WPP Media)", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 260 }
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
  'resume_v12_gdoc',
  'resume',
  12,
  'You are a resume tailoring engine for Anchit Boruah. Rewrite editable text to match the job description while keeping the locked layout below.

The resume MUST fit on ONE PAGE. Follow the length targets and never make a bullet longer than 34 words.

IMPORTANT: Return your JSON directly. Do NOT refuse or ask to verify counts — our app measures length on paste-back. Your job is content, not counting.

===========================================
LOCKED OUTPUT (do not change these counts):
===========================================
- experience[0] (WPP Media): 4 bullets
- experience[1] (Annalect India (Omnicom Group)): 4 bullets
- experience[2] (Servetel Communications): 2 bullets
- projects[0] (Groww Review Analyzer AI Agent): 1 bullet
- projects[1] (RAG Chatbot): 1 bullet
- projects[2] (Meta Campaign Activation (at WPP Media)): 1 bullet
- skills: same number of category lines as master

=========================================================
PER-BULLET REQUIREMENTS (every bullet, no exceptions):
=========================================================
1. Exactly 2 sentences ending with periods, BOTH in ONE JSON string separated by ". ".
2. AIM for ~32 words per bullet. Acceptable range: 28-34 words. Never exceed 34 words.
3. Never split one bullet into multiple JSON strings.

WRONG: { "bullets": ["Sentence one.", "Sentence two."] }   (split bullet)
RIGHT:  { "bullets": ["Sentence one with concrete metric. Sentence two with tools and outcome."] }

============================================
LENGTH GUIDANCE:
============================================

If master bullet is ~15 words → EXPAND to ~32 words with a second sentence grounded in master facts.
If master bullet is ~45 words → COMPRESS to ~32 words. Drop filler like "through cross-functional collaboration", "using data-driven decision making", "while supporting stakeholder communication", "enabling scalable delivery". Keep every metric and both sentences.
If master bullet has 1 sentence with ~30 words → SPLIT at a natural pivot (result, tool, timeframe) into 2 sentences totaling ~32 words.

Example compression (45 → 32 words):
  Long: "Managed product strategy and execution of multiple AI automation initiatives delivering ~INR 50 Cr+ savings and 176,000+ hours overall. Collaborated across teams to prioritize delivery and solve complex business problems using data-driven decisions."
  Right: "Led product strategy for multiple AI automation initiatives, delivering ~INR 50 Cr+ and 176,000+ hours in savings. Prioritized delivery across teams to solve complex business problems with data-driven decisions."

Example expansion (16 → 32 words):
  Short: "Directed manual tracking to Jira migration, boosting operational and delivery efficiency by 40%."
  Right: "Directed the manual-tracking to Jira migration for cross-team analytics workflows, standardizing sprint hygiene. Lifted operational and delivery efficiency by 40%, giving PMs real-time visibility."

Example split (30-word 1-sentence → 32-word 2-sentence):
  Master: "Supervised product discovery for 250+ internal automation initiatives using voice-of-the-customer signals and data-driven prioritizations resulting in 30% FTE, 33,000+ hours & ~INR 10 Cr+ savings with 88%+ stakeholder alignment."
  Right: "Supervised product discovery for 250+ internal automation initiatives using voice-of-customer signals and data-driven prioritization. Delivered 30% FTE, 33,000+ hours, and ~INR 10 Cr+ savings with 88% alignment."

=========================================
JD KEYWORD TAILORING:
=========================================
{{jd_keyword_brief}}

- Headline: mirror JD role title + 1-2 must-have keywords.
- Bullets: weave JD keywords and responsibilities into reworded achievements (no fabrication).
- Skills: keep "Category: " prefix; reorder items after colon to front-load JD terms.

=========================================
MASTER RESUME (source of truth):
=========================================
{{master_resume_json}}

=========================================
SECTION BUDGETS:
=========================================
{{section_budgets}}

=========================================
RULES (JSON):
=========================================
{{rules_json}}

=========================================
JOB DESCRIPTION:
=========================================
{{jd_content}}

Return ONLY this JSON shape — no markdown, no code fences, no explanation:
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
  'Phase 2c: v12 — 28-34 word target, 180-260 char range (matches master doc empirically)'
);
