/**
 * Apply 049_email_sent_status.sql.
 *
 * Widens the emails.draft_status check constraint by one value ('sent'). No
 * rows change, and every existing status stays legal.
 *
 * Usage: node scripts/migrate-email-sent-status.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const sqlText = fs.readFileSync(
  path.join(__dirname, "../db/migrations/049_email_sent_status.sql"),
  "utf8",
);

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 60,
});

try {
  await sql.unsafe(sqlText);
  console.log("Migration applied.");
  const [check] = await sql`
    SELECT pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'emails'
       AND con.conname = 'emails_draft_status_check'`;
  console.log(`  ${check?.definition ?? "constraint not found"}`);
  const rows = await sql`
    SELECT draft_status, count(*)::int AS emails
      FROM emails GROUP BY 1 ORDER BY 1`;
  for (const r of rows) console.log(`  ${r.draft_status}: ${r.emails}`);
} finally {
  await sql.end();
}
