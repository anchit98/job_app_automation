/**
 * Backfill gmail_thread_id + gmail_rfc_message_id on cold emails from Gmail drafts.
 * Usage: JOBAPP_USER_ID=<uuid> npx tsx scripts/backfill-email-thread-metadata.ts
 * Optional: APPLICATION_ID=<uuid> to scope to one application (e.g. MiQ).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { getEmailById } from "../src/lib/db/queries";
import { getGoogleAuthClient } from "../src/lib/google/tokens";
import { GmailClient } from "../src/lib/google/gmail";
import { resolveColdEmailThreadReplyContext } from "../src/lib/emails/thread-reply-context";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const userId = process.env.JOBAPP_USER_ID;
  const applicationId = process.env.APPLICATION_ID;

  if (!userId) {
    console.error("Set JOBAPP_USER_ID to the account that owns the Gmail connection.");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const rows = applicationId
    ? await sql`
        SELECT e.id, a.company, e.gmail_draft_id
        FROM emails e
        JOIN applications a ON a.id = e.application_id
        WHERE e.kind = 'cold'
          AND e.draft_status = 'created'
          AND e.gmail_draft_id IS NOT NULL
          AND (e.gmail_thread_id IS NULL OR e.gmail_rfc_message_id IS NULL)
          AND e.application_id = ${applicationId}
          AND a.user_id = ${userId}
      `
    : await sql`
        SELECT e.id, a.company, e.gmail_draft_id
        FROM emails e
        JOIN applications a ON a.id = e.application_id
        WHERE e.kind = 'cold'
          AND e.draft_status = 'created'
          AND e.gmail_draft_id IS NOT NULL
          AND (e.gmail_thread_id IS NULL OR e.gmail_rfc_message_id IS NULL)
          AND a.user_id = ${userId}
      `;

  console.log(`Found ${rows.length} cold email(s) missing thread metadata.`);

  const auth = await getGoogleAuthClient(userId);
  const gmail = new GmailClient(auth);

  let ok = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = await getEmailById(row.id);
    if (!email) {
      skipped++;
      continue;
    }
    try {
      const ctx = await resolveColdEmailThreadReplyContext(gmail, email);
      if (ctx) {
        console.log(`✓ ${row.company} — thread ${ctx.threadId.slice(0, 12)}…`);
        ok++;
      } else {
        console.log(`✗ ${row.company} — could not resolve thread (reconnect Google if mail was already sent)`);
        skipped++;
      }
    } catch (e) {
      console.log(`✗ ${row.company} — ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
    }
  }

  console.log(`Done: ${ok} backfilled, ${skipped} skipped.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
