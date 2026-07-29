/**
 * Gmail thread metadata on emails (for follow-up reply drafts).
 * Run: node scripts/migrate-email-thread-metadata.mjs
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

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function columnExists(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

if (!(await columnExists("emails", "gmail_thread_id"))) {
  await sql`ALTER TABLE emails ADD COLUMN gmail_thread_id TEXT`;
  console.log("Added emails.gmail_thread_id");
} else {
  console.log("emails.gmail_thread_id already exists");
}

if (!(await columnExists("emails", "gmail_rfc_message_id"))) {
  await sql`ALTER TABLE emails ADD COLUMN gmail_rfc_message_id TEXT`;
  console.log("Added emails.gmail_rfc_message_id");
} else {
  console.log("emails.gmail_rfc_message_id already exists");
}

await sql`
  INSERT INTO schema_migrations (version) VALUES (49)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete (version 49).");
await sql.end();
