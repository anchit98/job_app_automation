/**
 * Promote a specific user to admin by email.
 * Run: node scripts/promote-admin-user.mjs jobsforanchit.boruah@gmail.com
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/promote-admin-user.mjs <email>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const rows = await sql`
  UPDATE users
     SET is_admin = true,
         updated_at = ((NOW() AT TIME ZONE 'utc')::text)
   WHERE lower(email) = lower(${email})
   RETURNING id, email
`;

console.log(JSON.stringify(rows));
await sql.end();
