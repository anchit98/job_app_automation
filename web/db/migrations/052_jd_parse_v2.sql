-- Exhaustive JD keyword extraction.
--
-- jd_parse_v1 asked for the fields and nothing else, and the result was a
-- handful of must-have keywords for a description listing fifteen, with
-- acronyms (ETL, CI/CD, SaaS) skipped almost entirely. Every downstream step
-- reads that list: the tailoring prompt, the 70% coverage floor, and the
-- keyword chips on the application. What the parse drops, the resume drops.
--
-- v2 states the cost of omission, sets a target count, and says explicitly
-- that must-have covers the whole description rather than one heading.
-- src/lib/resume/jd-keyword-mining.ts adds a deterministic second pass on top.

UPDATE prompt_templates SET active = 0 WHERE kind = 'jd_parse';

INSERT INTO prompt_templates (
  id, kind, version, body, variables, output_schema, active, notes
)
VALUES (
  'jd_parse_v2',
  'jd_parse',
  2,
  $prompt$You extract structured fields from a job description for a job-application automation tool. The keyword lists you return decide which terms end up on the candidate's resume, so an omission costs the candidate a match the job actually asked for.

{{jd_wrapped}}

EXTRACTION RULES

1. Be exhaustive, not selective. Read the WHOLE description — requirements, responsibilities, the team blurb, and the tools mentioned in passing. A term named anywhere belongs in a list.
2. must_have_keywords: every skill, tool, method, domain and qualification the JD states as required, expected or assumed. Include what appears under headings like Requirements, Qualifications, What you'll need, About you, and every item stated as a duty the person will own. Aim for 12-25 entries when the JD supports it; return fewer only when the JD genuinely says less.
3. nice_to_have_keywords: only what the JD marks as preferred, bonus, a plus, or desirable. If the JD makes no such distinction, leave this empty rather than demoting real requirements into it.
4. tech_stack: named products, languages, frameworks, platforms and services — Python, Kubernetes, Salesforce, Figma, Snowflake. Not generic phrases.
5. Keep acronyms exactly as written (ETL, CI/CD, SaaS, B2B, KPI, OKR, SLA, GAAP) AND, where the JD spells one out, include the spelled-out form too.
6. Keep each keyword short — a term or a two-to-four word phrase, in the JD's own wording. Never a whole sentence.
7. Do not invent. Every keyword must appear in, or be the obvious short form of, something written in the JD.
8. responsibilities: the main duties, one short phrase each. requirements: the qualification bar (years of experience, degrees, certifications, clearances, language or location requirements).
9. seniority: the level as stated or clearly implied (Intern, Junior, Mid, Senior, Lead, Staff, Principal, Director). remote_policy: Remote, Hybrid, or On-site.
10. No duplicates within a list, and do not repeat a must-have inside nice-to-have.

Respond with ONLY valid JSON matching this schema — no markdown, no prose before or after:
{
  "company": "string",
  "role": "string",
  "seniority": "string",
  "must_have_keywords": ["string"],
  "nice_to_have_keywords": ["string"],
  "responsibilities": ["string"],
  "requirements": ["string"],
  "tech_stack": ["string"],
  "location": "string",
  "remote_policy": "string"
}

Use an empty string or empty array when a field cannot be determined from the JD.$prompt$,
  '["jd_wrapped"]',
  '{"type":"object","properties":{"company":{"type":"string"},"role":{"type":"string"},"seniority":{"type":"string"},"must_have_keywords":{"type":"array","items":{"type":"string"}},"nice_to_have_keywords":{"type":"array","items":{"type":"string"}},"responsibilities":{"type":"array","items":{"type":"string"}},"requirements":{"type":"array","items":{"type":"string"}},"tech_stack":{"type":"array","items":{"type":"string"}},"location":{"type":"string"},"remote_policy":{"type":"string"}}}',
  1,
  'Exhaustive keyword extraction - v1 returned too few must-haves and skipped acronyms'
)
ON CONFLICT (id) DO UPDATE SET
  body = EXCLUDED.body,
  variables = EXCLUDED.variables,
  output_schema = EXCLUDED.output_schema,
  active = 1,
  notes = EXCLUDED.notes,
  version = EXCLUDED.version;
