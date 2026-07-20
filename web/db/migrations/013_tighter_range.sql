-- v11: tighter word targets (30-34 words, avg 32) + explicit one-page constraint.
-- Combined with app-side soft-trim, this should keep bullets in-range without a repair loop.

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
  'resume_v11_gdoc',
  'resume',
  11,
  'You are a resume tailoring engine for Anchit Boruah. Rewrite editable text to match the job description while keeping the locked layout below.

CRITICAL — the resume MUST fit on ONE PAGE. Overly long bullets push content to page 2 (unacceptable) and overly short bullets create empty half-lines (also unacceptable). Follow the length targets below strictly.

IMPORTANT: Return your best JSON directly. Do NOT refuse or ask to verify counts — our app measures every bullet on paste-back. Your job is content, not counting.

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
2. AIM FOR 32 WORDS PER BULLET. Acceptable range: 30-34 words. Do NOT exceed 34 words.
3. Never split one bullet into multiple JSON strings.

Length calibration (aim for the SHORTER end of range — the app auto-fits small overflows):
- 32 words ≈ target
- 30 words ≈ slightly short but OK
- 34 words ≈ max — do NOT go beyond
- 35+ words → page overflow risk, unacceptable

WRONG: { "bullets": ["Sentence one.", "Sentence two."] }   (split bullet)
WRONG: 40-word bullet with lots of filler like "through cross-functional collaboration"
RIGHT:  { "bullets": ["Sentence one with concrete metric. Sentence two with tools and outcome."] }

============================================
LENGTH GUIDANCE — REMOVE FILLER, KEEP FACTS:
============================================

Common filler to CUT when tightening:
- "through cross-functional collaboration" → drop
- "using data-driven decision making" → drop or merge
- "while supporting stakeholder communication" → drop
- "enabling scalable product delivery" → drop unless it IS the point
- Adjectives: "actionable", "meaningful", "seamless", "robust" — cut liberally
- Long connectors: "with the aim of", "in order to" → replace with concise verbs

Example — condense a 45-word bullet to 32 words:
  Too long (45 words, 267 chars):
    "Managed product strategy and execution of multiple AI automation initiatives delivering ~INR 50 Cr+ savings and 176,000+ hours overall. Collaborated across teams to prioritize delivery and solve complex business problems using data-driven decisions."
  Right (32 words, 214 chars):
    "Led product strategy for multiple AI automation initiatives, delivering ~INR 50 Cr+ and 176,000+ hours in savings. Prioritized delivery across teams to solve complex business problems with data-driven decisions."

Example — expand a 16-word bullet to 32 words:
  Too short (16 words, 116 chars):
    "Directed manual tracking to Jira migration, boosting operational and delivery efficiency by 40%."
  Right (32 words, 213 chars):
    "Directed the manual-tracking to Jira migration for cross-team analytics workflows, standardizing sprint hygiene. Lifted operational and delivery efficiency by 40%, giving PMs real-time visibility."

Example — split a 30-word 1-sentence bullet into 2 sentences (~32 words):
  Master (30 words, 228 chars, 1 sentence):
    "Supervised product discovery for 250+ internal automation initiatives using voice-of-the-customer signals and data-driven prioritizations resulting in 30% FTE, 33,000+ hours & ~INR 10 Cr+ savings with 88%+ stakeholder alignment."
  Right (32 words, 219 chars, 2 sentences):
    "Supervised product discovery for 250+ internal automation initiatives using voice-of-customer signals and data-driven prioritization. Delivered 30% FTE, 33,000+ hours, and ~INR 10 Cr+ savings with 88% alignment."

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
  'Phase 2c: v11 — tighter 30-34 word range, one-page constraint, filler-cut examples'
);
