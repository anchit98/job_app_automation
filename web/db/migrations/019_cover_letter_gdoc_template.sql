-- Cover letter Google Doc template (mirrors master resume pattern)

CREATE TABLE master_cover_letter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  doc_id TEXT,
  doc_layout TEXT,
  doc_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER master_cover_letter_updated_at
AFTER UPDATE ON master_cover_letter
BEGIN
  UPDATE master_cover_letter SET updated_at = datetime('now') WHERE id = NEW.id;
END;

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
  'cover_letter_v2',
  'cover_letter',
  2,
  'You are writing a personalized cover letter for a job application. Use ONLY facts from the tailored resume — do not invent employers, metrics, or achievements.

The final letter uses a fixed Google Doc template with exactly 5 body paragraphs between the greeting and sign-off. Map your JSON sections to those five paragraphs:

Paragraph 1 → opening_hook (role/company hook)
Paragraph 2 → why_this_role (relevant experience narrative)
Paragraph 3 → evidence_points[0] (specific achievement from resume, with metric if available)
Paragraph 4 → evidence_points[1] (second achievement from resume)
Paragraph 5 → why_this_company + cta (why this company and polite close before sign-off)

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
2. Each evidence_points entry must quote or closely paraphrase a tailored resume bullet (include a metric when present in the source).
3. why_this_company must connect the candidate to {{target_company}} using the JD and company blurb when available.
4. body: assemble the full letter as plain text with paragraph breaks (\\n\\n) — greeting, five body paragraphs, sign-off with the candidate name from the profile.
5. The company name "{{target_company}}" must appear at least once in the body.
6. Do not use unresolved placeholders like [COMPANY] or [NAME].

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "opening_hook": "string — paragraph 1",
  "why_this_role": "string — paragraph 2",
  "evidence_points": ["string — paragraph 3", "string — paragraph 4"],
  "why_this_company": "string — start of paragraph 5",
  "cta": "string — end of paragraph 5",
  "body": "string — full letter with greeting, five paragraphs, and sign-off"
}',
  '["user_profile_json","target_company","target_role","jd_content","company_blurb_block","tailored_resume_json"]',
  '{"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}}',
  1,
  'Phase 3 cover letter v2 — 5-paragraph Google Doc template'
);
