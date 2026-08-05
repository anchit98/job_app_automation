import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const templatesPath = path.join(__dirname, "_prompt_templates.json");
const templates = JSON.parse(fs.readFileSync(templatesPath, "utf8"));

const coldEmailBody = `You write personalized cold outreach emails for a job-application automation tool.

GOAL: Short, well-structured emails that showcase the candidate's best traits, skills, and achievements from the tailored resume (facts only — never invent). Present the strongest proof points as markdown bullet points.

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
1. Structure each email as:
   - Personalized greeting + 1 short opening sentence
   - A short lead-in line (optional, 1 sentence)
   - 2–4 markdown bullet points highlighting the candidate's best traits, skills, and quantified achievements that match the JD
   - 1 sentence on why this company/role
   - Clear CTA (e.g. 15-min chat)
2. Keep each body short: aim for ~80–130 words (hard max ~150). Bullets should be one line each.
3. Opening sentence MUST be unique per contact and grounded in shared_context and/or that contact's role/linkedin. Do not reuse the same opener.
4. Bullet points must use real resume facts/metrics only — pick the strongest JD-aligned proof, not the whole resume.
5. Match tone to role_template:
   - hiring_manager / director_product / vp_product: peer-to-peer, outcome-focused
   - recruiter: clear fit summary, easy to forward
   - founder: concise, energy, why now
6. Plain markdown. Start with a greeting (e.g. Hi {name},).
7. Subject lines: specific, not spammy. Include role or company when natural.
8. Never leave placeholders like [COMPANY], {{name}}, or YOUR_NAME.
9. Do NOT include a sign-off or signature block — no "Best regards", name, title, phone, email, or location at the end. Gmail adds the signature automatically. End on the CTA sentence.

Respond with ONLY valid JSON matching this schema — no markdown fences, no prose:
{
  "emails": [
    {
      "contact_id": "string — must match an input contact_id",
      "subject": "string",
      "body_md": "string — markdown body: greeting, bullets, CTA only, no sign-off"
    }
  ]
}

Return one entry for every contact listed above. Do not omit any contact_id.`;

const coverLetterBody = `You are writing a personalized cover letter for a job application. Use ONLY facts from the tailored resume — do not invent employers, metrics, or achievements.

GOAL: Include as many job-description keywords as possible that are already supported by the tailored resume, in a concise letter that fits the fixed one-page Google Doc template.

The app inserts the greeting ("Dear [Company] Hiring Team,") and sign-off automatically. Your JSON supplies only the five body paragraphs between them.

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
1. Write in a warm, confident tone (not generic). Naturally include as many JD keywords as fit where they are already supported by the resume.
2. NEVER start opening_hook or any section with "Dear ..." — the template already has the greeting.
3. Each evidence_points entry must quote or closely paraphrase a tailored resume bullet and include at least one quantified outcome from that bullet (%, $, scale, time saved, user counts, years of experience, throughput, revenue, etc.). Use the exact numbers from the resume — never invent metrics.
4. Put the strongest, most impressive metrics in evidence_points.
5. Keep every paragraph concise so the letter stays on one page in the template — prefer shorter sentences over padding. Do not overflow the template.
6. why_this_company must connect the candidate to {{target_company}} using the JD and company blurb when available.
7. body: optional full letter for reference — if included, use one greeting only. Section fields must not repeat the greeting.
8. The company name "{{target_company}}" must appear at least once across the letter.
9. Do not use unresolved placeholders like [COMPANY] or [NAME].

Respond with ONLY valid JSON matching this shape — no markdown, no prose before or after:
{
  "opening_hook": "string — paragraph 1, starts with hook sentence NOT Dear ...",
  "why_this_role": "string — paragraph 2",
  "evidence_points": ["string — paragraph 3 with metric", "string — paragraph 4 with metric"],
  "why_this_company": "string — start of paragraph 5",
  "cta": "string — end of paragraph 5",
  "body": "string — optional full letter"
}`;

// Deactivate previous active rows for these kinds, then upsert new versions
await sql`UPDATE prompt_templates SET active = 0 WHERE kind = 'cold_email' AND active = 1`;
await sql`UPDATE prompt_templates SET active = 0 WHERE kind = 'cover_letter' AND active = 1`;

const coldId = randomUUID();
const coverId = randomUUID();
const now = new Date().toISOString();

await sql`
  INSERT INTO prompt_templates (id, kind, version, body, variables, output_schema, active, notes, created_at)
  VALUES (
    ${coldId},
    'cold_email',
    4,
    ${coldEmailBody},
    ${JSON.stringify(["user_profile_json","target_company","target_role","jd_content","tailored_resume_json","shared_context","contacts_json"])},
    ${JSON.stringify({"type":"object","required":["emails"],"properties":{"emails":{"type":"array","items":{"type":"object","required":["contact_id","subject","body_md"],"properties":{"contact_id":{"type":"string"},"subject":{"type":"string"},"body_md":{"type":"string"}}}}}})},
    1,
    'v4 — short emails; achievements as bullet points; generic candidate',
    ${now}
  )
`;

await sql`
  INSERT INTO prompt_templates (id, kind, version, body, variables, output_schema, active, notes, created_at)
  VALUES (
    ${coverId},
    'cover_letter',
    5,
    ${coverLetterBody},
    ${JSON.stringify(["user_profile_json","target_company","target_role","jd_content","company_blurb_block","tailored_resume_json"])},
    ${JSON.stringify({"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}})},
    1,
    'v5 — maximize grounded JD keywords; concise one-page template',
    ${now}
  )
`;

// Keep resume v29 active; refresh body notes alignment is already good.
// Update resume v29 kickoff is code-side; optionally tighten body wording if needed.
const [resumeActive] = await sql`
  SELECT id, version, notes FROM prompt_templates WHERE kind = 'resume' AND active = 1 LIMIT 1
`;
console.log("Active resume:", resumeActive);

// Sync JSON dump: deactivate old, append new
for (const t of templates) {
  if (t.kind === "cold_email" || t.kind === "cover_letter") t.active = 0;
}
templates.push(
  {
    id: coverId,
    kind: "cover_letter",
    version: 5,
    body: coverLetterBody,
    variables: JSON.stringify([
      "user_profile_json",
      "target_company",
      "target_role",
      "jd_content",
      "company_blurb_block",
      "tailored_resume_json",
    ]),
    output_schema:
      '{"type":"object","required":["opening_hook","why_this_role","evidence_points","why_this_company","cta","body"],"properties":{"opening_hook":{"type":"string"},"why_this_role":{"type":"string"},"evidence_points":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"why_this_company":{"type":"string"},"cta":{"type":"string"},"body":{"type":"string"}}}',
    active: 1,
    notes: "v5 — maximize grounded JD keywords; concise one-page template",
    created_at: now,
  },
  {
    id: coldId,
    kind: "cold_email",
    version: 4,
    body: coldEmailBody,
    variables: JSON.stringify([
      "user_profile_json",
      "target_company",
      "target_role",
      "jd_content",
      "tailored_resume_json",
      "shared_context",
      "contacts_json",
    ]),
    output_schema:
      '{"type":"object","required":["emails"],"properties":{"emails":{"type":"array","items":{"type":"object","required":["contact_id","subject","body_md"],"properties":{"contact_id":{"type":"string"},"subject":{"type":"string"},"body_md":{"type":"string"}}}}}}',
    active: 1,
    notes: "v4 — short emails; achievements as bullet points; generic candidate",
    created_at: now,
  },
);

fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2) + "\n");

const check = await sql`
  SELECT kind, version, active, notes FROM prompt_templates
  WHERE kind IN ('resume','cover_letter','cold_email') AND active = 1
  ORDER BY kind
`;
console.log("Active templates:", check);
await sql.end();
