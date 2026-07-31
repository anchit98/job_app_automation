-- Cover letter v4: never emit greeting/sign-off in JSON (template owns both)
-- Resume v29: REPLACE JD keywords in place; never grow line count (one page)

UPDATE prompt_templates SET active = 0 WHERE kind = 'cover_letter';

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
  'cover_letter_v4',
  'cover_letter',
  4,
  'You are writing a personalized cover letter for a job application. Use ONLY facts from the tailored resume — do not invent employers, metrics, or achievements.

The final letter uses a fixed Google Doc template. The app inserts BOTH the greeting ("Dear [Company] Hiring Team,") AND the sign-off ("Warm regards," + name) automatically. Your JSON supplies only the five body paragraphs between them — never repeat greeting or sign-off.

Paragraph 1 → opening_hook (role/company hook — NO greeting line)
Paragraph 2 → why_this_role (relevant experience narrative)
Paragraph 3 → evidence_points[0] (specific achievement from resume WITH a quantified metric)
Paragraph 4 → evidence_points[1] (second achievement WITH a quantified metric)
Paragraph 5 → why_this_company + cta (why this company + polite interview ask — NO "Warm regards" / name)

User profile:
{{user_profile_json}}

<target_company>
{{target_company}}
</target_company>

<target_role>
{{target_role}}
</target_role>

Job description:
{{jd_content}}

{{company_blurb_block}}

Tailored resume (source of truth for evidence — cite specific bullets):
{{tailored_resume_json}}

Instructions:
1. Write in a warm, confident tone (not generic).
2. NEVER start opening_hook or any section with "Dear ..." — the template already has the greeting.
3. NEVER end cta, why_this_company, evidence_points, or body with "Warm regards", "Best regards", "Sincerely", or the candidate name — the template already has the sign-off.
4. cta should be a single polite close (e.g. interest in discussing the role) with no signature block.
5. Each evidence_points entry must quote or closely paraphrase a tailored resume bullet and include at least one quantified outcome from that bullet. Use exact numbers from the resume — never invent metrics.
6. why_this_company must connect the candidate to {{target_company}} using the JD and company blurb when available.
7. body: optional full letter for reference — body paragraphs only, no greeting and no sign-off.
8. The company name "{{target_company}}" must appear at least once across the letter.
9. Do not use unresolved placeholders like [COMPANY] or [NAME].

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "opening_hook": "string — paragraph 1, starts with hook sentence NOT Dear ...",
  "why_this_role": "string — paragraph 2",
  "evidence_points": ["string — paragraph 3 with metric", "string — paragraph 4 with metric"],
  "why_this_company": "string — start of paragraph 5",
  "cta": "string — end of paragraph 5, NO sign-off",
  "body": "string — optional body-only letter"
}',
  '["user_profile_json","target_company","target_role","jd_content","company_blurb_block","tailored_resume_json"]',
  '{"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}}',
  1,
  'Cover letter v4 — no duplicate greeting or sign-off; template owns both'
)
ON CONFLICT(id) DO UPDATE SET
  body = excluded.body,
  notes = excluded.notes,
  active = 1,
  version = excluded.version,
  output_schema = excluded.output_schema,
  variables = excluded.variables;

UPDATE prompt_templates SET active = 0 WHERE kind = 'resume' AND id <> 'resume_v29_gdoc';

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
  'resume_v29_gdoc',
  'resume',
  29,
  'ATS keyword REPLACE for Anchit Boruah''s resume — keep master line count; do NOT add text.

MODE: In-place REPLACE only. Start from each MASTER line verbatim. Replace existing words/phrases with JD keywords where already true. Never append clauses, titles, or keyword stacks — that wraps extra lines and breaks the one-page PDF.

ALLOWED:
- Synonym / phrase REPLACE inside an existing clause
- Replace a word or short phrase with a JD term when meaning stays the same and length stays ≤ MASTER
- Skills: keep each "Category:" prefix; REPLACE items after the colon (if you introduce a JD term, DROP a less-relevant master item so the line is not longer)
- Subheader (headline): REPLACE words only — do NOT append

FORBIDDEN:
- Adding words that make any line longer than its MASTER line
- Adding bullets, sentences, or skill items (counts must match MASTER)
- Rewriting for style/flow
- New metrics, companies, projects, or claims not in MASTER
- Truncating mid-sentence

ONE PAGE RULE (non-negotiable): each output headline/bullet/skill line character length ≤ corresponding MASTER line. Prefer shorter complete lines over longer keyword stuffing.

WORD CEILING: Experience bullets + project bullets + skills ≤ 400 words total and never above master total.

===========================================
JD KEYWORDS:
===========================================
{{jd_keyword_brief}}

===========================================
SECTION BUDGET + MASTER REFERENCE:
===========================================
{{section_budgets}}

===========================================
MASTER RESUME JSON:
===========================================
{{master_resume_json}}

===========================================
JOB DESCRIPTION:
===========================================
{{jd_content}}

Return ONLY complete JSON.',
  '["master_resume_json","jd_content","jd_keyword_brief","rules_json","section_budgets"]',
  '{"type":"object","required":["experience","projects","skills"],"properties":{"headline":{"type":"string"},"experience":{"type":"array"},"projects":{"type":"array"},"skills":{"type":"array"}}}',
  1,
  'v29 — REPLACE keywords in place; never grow lines; one-page mandatory'
)
ON CONFLICT(id) DO UPDATE SET
  body = excluded.body,
  notes = excluded.notes,
  active = 1,
  version = excluded.version,
  output_schema = excluded.output_schema,
  variables = excluded.variables;
