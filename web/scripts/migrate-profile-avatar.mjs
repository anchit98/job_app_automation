/**
 * Add profile avatar columns.
 * Run: node scripts/migrate-profile-avatar.mjs
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

if (!(await columnExists("profiles", "avatar_data"))) {
  await sql`
    ALTER TABLE profiles
    ADD COLUMN avatar_data TEXT
  `;
  console.log("Added profiles.avatar_data");
} else {
  console.log("profiles.avatar_data already exists");
}

if (!(await columnExists("profiles", "avatar_mime"))) {
  await sql`
    ALTER TABLE profiles
    ADD COLUMN avatar_mime TEXT
  `;
  console.log("Added profiles.avatar_mime");
} else {
  console.log("profiles.avatar_mime already exists");
}

await sql`
  INSERT INTO schema_migrations (version) VALUES (46)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete (version 46).");
await sql.end();
