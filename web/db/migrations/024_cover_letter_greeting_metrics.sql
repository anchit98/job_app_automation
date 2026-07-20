-- Cover letter v3: single greeting (app template only) + mandatory resume metrics

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
  'cover_letter_v3',
  'cover_letter',
  3,
  'You are writing a personalized cover letter for a job application. Use ONLY facts from the tailored resume — do not invent employers, metrics, or achievements.

The final letter uses a fixed Google Doc template. The app inserts the greeting ("Dear [Company] Hiring Team,") and sign-off automatically. Your JSON supplies only the five body paragraphs between them.

Paragraph 1 → opening_hook (role/company hook — NO greeting line)
Paragraph 2 → why_this_role (relevant experience narrative)
Paragraph 3 → evidence_points[0] (specific achievement from resume WITH a quantified metric)
Paragraph 4 → evidence_points[1] (second achievement WITH a quantified metric)
Paragraph 5 → why_this_company + cta (why this company and polite close)

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
3. Each evidence_points entry must quote or closely paraphrase a tailored resume bullet and include at least one quantified outcome from that bullet (%, $, scale, time saved, user counts, years of experience, throughput, revenue, etc.). Use the exact numbers from the resume — never invent metrics.
4. Put your strongest, most impressive metrics in evidence_points — these are what make the letter stand out.
5. why_this_company must connect the candidate to {{target_company}} using the JD and company blurb when available.
6. body: optional full letter for reference — if included, use one greeting only. Section fields must not repeat the greeting.
7. The company name "{{target_company}}" must appear at least once across the letter.
8. Do not use unresolved placeholders like [COMPANY] or [NAME].

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "opening_hook": "string — paragraph 1, starts with hook sentence NOT Dear ...",
  "why_this_role": "string — paragraph 2",
  "evidence_points": ["string — paragraph 3 with metric", "string — paragraph 4 with metric"],
  "why_this_company": "string — start of paragraph 5",
  "cta": "string — end of paragraph 5",
  "body": "string — optional full letter"
}',
  '["user_profile_json","target_company","target_role","jd_content","company_blurb_block","tailored_resume_json"]',
  '{"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}}',
  1,
  'Cover letter v3 — no duplicate greeting; metrics required in evidence'
);
