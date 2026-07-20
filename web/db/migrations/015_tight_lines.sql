-- v13: bullet max 245 (down from 260), skill lines validated per-line (master length + 30 chars).

UPDATE master_resume
SET rules = json('{
  "never_fabricate": true,
  "bullet_layout_locked": true,
  "bullet_layout_version": 3,
  "bullet_layout": {
    "experience": [
      { "label": "WPP Media", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 },
      { "label": "Annalect India (Omnicom Group)", "bullets": 4, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 },
      { "label": "Servetel Communications", "bullets": 2, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 }
    ],
    "projects": [
      { "label": "Groww Review Analyzer AI Agent", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 },
      { "label": "RAG Chatbot", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 },
      { "label": "Meta Campaign Activation (at WPP Media)", "bullets": 1, "sentences_per_bullet": 2, "min_chars": 180, "max_chars": 245 }
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
  'resume_v13_gdoc',
  'resume',
  13,
  'You are a resume tailoring engine for Anchit Boruah. Rewrite editable text to match the job description while keeping the locked layout below.

The resume MUST fit on ONE PAGE. Every bullet must render as EXACTLY 2 lines and every skill line as EXACTLY 1 line in the Google Doc. Even 1-2 extra words push content to a new line and force page 2.

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
- skills: same number of category lines as master, each a single line

=========================================================
PER-BULLET REQUIREMENTS (every bullet, no exceptions):
=========================================================
1. Exactly 2 sentences ending with periods, BOTH in ONE JSON string separated by ". ".
2. AIM for 28-30 words per bullet. HARD MAX: 32 words. Beyond 32 words the bullet spills to a 3rd line.
3. Never split one bullet into multiple JSON strings.

WRONG: 34-word bullet with filler at end like "through cross-functional collaboration"
RIGHT: 30-word bullet — one clear achievement, one clear outcome, both packed with keywords.

=========================================================
SKILL LINE REQUIREMENTS:
=========================================================
- Keep each "Category:" prefix EXACTLY as in master (no additions like "&", "and", etc.).
- After the colon, list JD-prioritized items separated by ", ".
- Do NOT add so many items that the line wraps. Roughly keep item count similar to master; if you must add JD items, DROP the least-relevant master items so length stays close to master.
- Rule of thumb: each skill line stays within +30 characters of the master line length. If master is 99 chars, aim for < 130 chars.

============================================
LENGTH GUIDANCE FOR BULLETS:
============================================

Master ~15 words → EXPAND to ~30 words with a second sentence grounded in master facts.
Master ~45 words → COMPRESS to ~30 words. Cut filler: "through cross-functional collaboration", "using data-driven decisions", "while enabling scalable delivery", "supporting stakeholder communication". Keep every metric and both sentences.
Master ~30-word 1-sentence → SPLIT at a natural pivot (result, tool, timeframe) into 2 sentences totaling ~30 words.

Example compression (45 → 30 words):
  Long: "Managed product strategy and execution of multiple AI automation initiatives delivering ~INR 50 Cr+ savings and 176,000+ hours overall. Collaborated across teams to prioritize delivery and solve complex business problems using data-driven decisions."
  Right: "Led product strategy for multiple AI automation initiatives, delivering ~INR 50 Cr+ and 176,000+ hours in savings. Prioritized delivery across teams to solve complex business problems."

Example expansion (16 → 30 words):
  Short: "Directed manual tracking to Jira migration, boosting operational and delivery efficiency by 40%."
  Right: "Directed the manual-tracking to Jira migration for cross-team analytics workflows. Lifted operational and delivery efficiency by 40%, giving PMs real-time visibility."

Example split (30-word 1-sentence → 30-word 2-sentence):
  Master: "Supervised product discovery for 250+ internal automation initiatives using voice-of-the-customer signals and data-driven prioritizations resulting in 30% FTE, 33,000+ hours & ~INR 10 Cr+ savings with 88%+ stakeholder alignment."
  Right: "Supervised product discovery for 250+ internal automation initiatives using voice-of-customer signals and data-driven prioritization. Delivered 30% FTE, 33,000+ hours, and ~INR 10 Cr+ savings."

Example skill line (do not overflow to line 2):
  Master (99 chars): "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT"
  RIGHT tailored (~120 chars): "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT, Cohort Analysis"
  WRONG (>150 chars — wraps): "Product Analytics & Growth: KPI Ownership, A/B Testing, Funnel Optimization, Retention, Churn, CSAT, Cohort Analysis, Product Metrics, User Segmentation, Growth Loops"

=========================================
JD KEYWORD TAILORING:
=========================================
{{jd_keyword_brief}}

- Headline: mirror JD role title + 1-2 must-have keywords.
- Bullets: weave JD keywords and responsibilities into reworded achievements (no fabrication).
- Skills: keep "Category: " prefix; reorder items after colon to front-load JD terms. Drop weakest master items if you add JD items so the line still fits on ONE line.

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
  'Phase 2c: v13 — 28-32 word bullets (max 245 chars), skill lines <= master + 30 chars, one-page hard constraint'
);
