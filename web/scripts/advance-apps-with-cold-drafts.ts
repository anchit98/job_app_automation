/**
 * Set email_sent (and schedule follow-ups) for apps that have cold Gmail drafts.
 * Usage: npx tsx scripts/advance-apps-with-cold-drafts.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { syncApplicationStatusAfterColdDrafts } from "../src/app/actions/applications";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const apps = await sql`
    SELECT DISTINCT a.id, a.company, a.role, a.status
    FROM applications a
    JOIN emails e ON e.application_id = a.id
    WHERE e.kind = 'cold'
      AND e.draft_status = 'created'
      AND e.gmail_draft_id IS NOT NULL
      AND a.status NOT IN (
        'email_sent', 'hr_replied', 'interview_scheduled',
        'offer', 'accepted', 'rejected', 'withdrawn'
      )
    ORDER BY a.company
  `;

  console.log(`Found ${apps.length} application(s) with drafts not yet at email_sent.`);

  for (const app of apps) {
    const result = await syncApplicationStatusAfterColdDrafts(app.id);
    console.log(
      `${app.company} (${app.status}) →`,
      result.outcome === "advanced" ? result.new_status : result.outcome,
    );
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
