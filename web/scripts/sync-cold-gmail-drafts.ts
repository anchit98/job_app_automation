/**
 * Re-touch cold Gmail drafts for an application (backfill thread metadata + status sync).
 * Usage: APPLICATION_ID=<uuid> npx tsx scripts/sync-cold-gmail-drafts.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { createGmailDrafts } from "../src/app/actions/emails";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const applicationId = process.env.APPLICATION_ID;
  if (!applicationId) {
    console.error("Set APPLICATION_ID");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const emails = await sql`
    SELECT id FROM emails
    WHERE application_id = ${applicationId}
      AND kind = 'cold'
      AND draft_status = 'created'
      AND gmail_draft_id IS NOT NULL
  `;

  if (emails.length === 0) {
    console.log("No cold Gmail drafts found for this application.");
    await sql.end();
    return;
  }

  console.log(`Syncing ${emails.length} cold draft(s) for application ${applicationId}…`);
  const result = await createGmailDrafts(emails.map((e) => e.id));
  console.log(JSON.stringify(result, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
