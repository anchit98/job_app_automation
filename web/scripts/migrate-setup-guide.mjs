/**
 * Add setup guide flags on profiles.
 * Run: node scripts/migrate-setup-guide.mjs
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

if (!(await columnExists("profiles", "setup_console_done_at"))) {
  await sql`
    ALTER TABLE profiles
    ADD COLUMN setup_console_done_at TEXT
  `;
  console.log("Added profiles.setup_console_done_at");
} else {
  console.log("profiles.setup_console_done_at already exists");
}

if (!(await columnExists("profiles", "setup_guide_collapsed"))) {
  await sql`
    ALTER TABLE profiles
    ADD COLUMN setup_guide_collapsed BOOLEAN NOT NULL DEFAULT false
  `;
  console.log("Added profiles.setup_guide_collapsed");
} else {
  console.log("profiles.setup_guide_collapsed already exists");
}

await sql`
  INSERT INTO schema_migrations (version) VALUES (45)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete (version 45).");
await sql.end();
