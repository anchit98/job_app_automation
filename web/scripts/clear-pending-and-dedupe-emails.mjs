/**
 * Clear pending prompt runs, dedupe cold emails, add unique index.
 *
 *   cd web && node scripts/clear-pending-and-dedupe-emails.mjs
 */
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL in web/.env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  const pendingBefore = await sql`
    SELECT COUNT(*)::int AS n FROM prompt_runs WHERE status = 'pending'
  `;
  console.log("pending prompts before:", pendingBefore[0].n);

  await sql`
    UPDATE prompt_runs SET status = 'abandoned' WHERE status = 'pending'
  `;
  await sql`
    UPDATE pending_extension_runs
       SET status = 'completed',
           wake_until = NULL,
           error = 'cleared',
           updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE status IN ('pending', 'claimed')
  `;

  const pendingAfter = await sql`
    SELECT COUNT(*)::int AS n FROM prompt_runs WHERE status = 'pending'
  `;
  console.log("pending prompts after:", pendingAfter[0].n);

  // Keep newest cold email per (application_id, contact_id); drop older dupes.
  const deleted = await sql`
    DELETE FROM emails e
     WHERE e.kind = 'cold'
       AND EXISTS (
         SELECT 1 FROM emails newer
          WHERE newer.kind = 'cold'
            AND newer.application_id = e.application_id
            AND newer.contact_id = e.contact_id
            AND newer.created_at > e.created_at
       )
     RETURNING e.id
  `;
  console.log("duplicate cold emails removed:", deleted.length);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS emails_one_cold_per_contact
      ON emails (application_id, contact_id)
      WHERE kind = 'cold'
  `;
  console.log("unique index emails_one_cold_per_contact ensured");

  console.log("done");
} finally {
  await sql.end({ timeout: 5 });
}
