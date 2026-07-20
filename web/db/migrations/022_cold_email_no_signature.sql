-- Cold email: omit sign-off (Gmail adds signature automatically)

UPDATE prompt_templates SET active = 0 WHERE kind = 'cold_email';

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
  'cold_email_batch_v2',
  'cold_email',
  2,
  'You write personalized cold outreach emails for a job-application automation tool.

Candidate profile:
{{user_profile_json}}

Application:
- Company: {{target_company}}
- Role: {{target_role}}

Job description / context:
{{jd_content}}

Tailored resume (JSON — cite real facts only; never invent):
{{tailored_resume_json}}

Shared context from the candidate (hooks to personalize openings — university, mutual connections, posts, news):
{{shared_context}}

Contacts to write for (write exactly one email per contact; use the contact_id values verbatim):
{{contacts_json}}

Rules:
1. Structure each email: personalized opening → relevant experience from the resume → why this company → clear CTA (e.g. 15-min chat).
2. Opening sentence MUST be unique per contact and grounded in shared_context and/or that contact''s role/linkedin. Do not reuse the same opener.
3. Match tone to role_template:
   - hiring_manager / director_product / vp_product: peer-to-peer, outcome-focused
   - recruiter: clear fit summary, easy to forward
   - founder: concise, energy, why now
4. Keep each body under ~180 words. Plain markdown. Start with a greeting (e.g. Hi {name},).
5. Subject lines: specific, not spammy. Include role or company when natural.
6. Never leave placeholders like [COMPANY], {{name}}, or YOUR_NAME.
7. Do NOT include a sign-off or signature block — no "Best regards", name, title, phone, email, or location at the end. The app appends a fixed signature when creating Gmail drafts. End on the CTA sentence.

Respond with ONLY valid JSON matching this schema — no markdown fences, no prose:
{
  "emails": [
    {
      "contact_id": "string — must match an input contact_id",
      "subject": "string",
      "body_md": "string — markdown body: greeting through CTA only, no sign-off"
    }
  ]
}

Return one entry for every contact listed above. Do not omit any contact_id.',
  '["user_profile_json","target_company","target_role","jd_content","tailored_resume_json","shared_context","contacts_json"]',
  '{"type":"object","required":["emails"],"properties":{"emails":{"type":"array","items":{"type":"object","required":["contact_id","subject","body_md"],"properties":{"contact_id":{"type":"string"},"subject":{"type":"string"},"body_md":{"type":"string"}}}}}}',
  1,
  'Phase 5 v2 — no sign-off; Gmail signature appended by client'
);
