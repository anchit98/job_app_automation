import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const apps = await sql`
  SELECT id, company, role, status, user_id, created_at
  FROM applications
  WHERE company ILIKE '%miq%'
     OR role ILIKE '%miq%'
     OR jd_raw ILIKE '%miq%'
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log("APPS", JSON.stringify(apps, null, 2));

for (const app of apps) {
  const emails = await sql`
    SELECT id, kind, subject, draft_status, gmail_draft_id,
           gmail_thread_id, gmail_rfc_message_id, contact_id
    FROM emails
    WHERE application_id = ${app.id}
  `;
  const fus = await sql`
    SELECT id, sequence, status, due_at, email_id, draft_email_id
    FROM follow_ups
    WHERE application_id = ${app.id}
    ORDER BY sequence
  `;
  console.log(`\n=== ${app.company} / ${app.role} (${app.status}) ===`);
  console.log("EMAILS", JSON.stringify(emails, null, 2));
  console.log("FOLLOW_UPS", JSON.stringify(fus, null, 2));
}

await sql.end();
