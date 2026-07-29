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

const stuck = await sql`
  SELECT DISTINCT a.id, a.company, a.role, a.status
  FROM applications a
  JOIN emails e ON e.application_id = a.id
  WHERE e.kind = 'cold'
    AND e.draft_status = 'created'
    AND e.gmail_draft_id IS NOT NULL
    AND a.status NOT IN ('email_sent', 'hr_replied', 'interview_scheduled', 'offer', 'accepted', 'rejected', 'withdrawn')
  ORDER BY a.company
`;
console.log("APPS_WITH_DRAFTS_NOT_EMAIL_SENT", JSON.stringify(stuck, null, 2));

const missingThread = await sql`
  SELECT e.id, e.application_id, a.company, e.gmail_draft_id, e.gmail_thread_id
  FROM emails e
  JOIN applications a ON a.id = e.application_id
  WHERE e.kind = 'cold'
    AND e.draft_status = 'created'
    AND e.gmail_draft_id IS NOT NULL
    AND (e.gmail_thread_id IS NULL OR e.gmail_rfc_message_id IS NULL)
  LIMIT 20
`;
console.log("MISSING_THREAD_META", JSON.stringify(missingThread, null, 2));

await sql.end();
