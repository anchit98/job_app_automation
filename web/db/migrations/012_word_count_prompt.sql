-- v10: word-count targets instead of char-count self-check (avoids ChatGPT refusal).

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
  'resume_v10_gdoc',
  'resume',
  10,
  'You are a resume tailoring engine for Anchit Boruah. Rewrite editable text to match the job description while keeping the locked layout below.

IMPORTANT: Return your best JSON now. Do NOT refuse or ask to verify character counts — our app measures length automatically on paste-back and will send a targeted fix prompt if any bullet is off. Your job is content + structure, not counting.

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
PER-BULLET REQUIREMENTS (every bullet):
=========================================================
1. Exactly 2 sentences ending with periods, BOTH in ONE JSON string separated by ". ".
2. Length: ~35 words per bullet (range 32-38 words). This fills 2 lines in the resume doc.
3. Never split one bullet into multiple JSON strings.

WRONG: { "bullets": ["Sentence one.", "Sentence two."] }
RIGHT:  { "bullets": ["Sentence one. Sentence two."] }

============================================
LENGTH GUIDANCE (use word count, not chars):
============================================

Too short master bullet (~15 words)? EXPAND to ~35 words:
  Master: "Directed manual tracking to Jira migration, boosting operational and delivery efficiency by 40% compared to earlier."
  Rewrite (~35 words): "Directed the manual-tracking to Jira migration for cross-team analytics workflows, standardizing sprint hygiene and reporting. Lifted operational and delivery efficiency by 40%, giving PMs and leadership real-time visibility."

Too long master bullet (~50 words)? COMPRESS to ~35 words:
  Master: "Built an AI-powered Voice of Customer agent that aggregates and analyzes weekly App Store and Play Store reviews against a rolling 3-month corpus, generating actionable sentiment insights, prioritizing user pain points, and leadership-ready reports via Google Docs and Gmail drafts, eliminating manual analysis and enabling scalable product decision-making."
  Rewrite (~35 words): "Built an AI-powered VoC agent that ingests weekly App/Play Store reviews against a rolling 3-month corpus and surfaces prioritized user pain points. Ships leadership-ready reports via Google Docs and Gmail, replacing manual review analysis."

Single-sentence master (~30 words)? SPLIT into 2 sentences, keep ~35 words total:
  Master: "Supervised product discovery for 250+ internal automation initiatives using voice-of-the-customer signals and data-driven prioritizations resulting in 30% FTE, 33,000+ hours & ~INR 10 Cr+ savings with 88%+ stakeholder alignment."
  Rewrite (~35 words): "Supervised product discovery for 250+ internal automation initiatives, using voice-of-customer signals and data-driven prioritization. Delivered 30% FTE, 33,000+ hours, and ~INR 10 Cr+ savings with 88%+ stakeholder alignment."

=========================================
JD KEYWORD TAILORING:
=========================================
{{jd_keyword_brief}}

- Headline: mirror JD role title + 1-2 must-have keywords.
- Bullets: weave must-have keywords and responsibilities into reworded achievements.
- Skills: keep "Category: " prefix; reorder items after colon to front-load JD terms.
- Ground every claim in master resume facts — never fabricate.

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
  'Phase 2c: v10 — word-count targets, no char-count self-check, explicit do-not-refuse'
);
