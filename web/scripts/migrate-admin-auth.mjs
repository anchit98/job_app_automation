/**
 * Add admin role and password recovery tables.
 * Run: node scripts/migrate-admin-auth.mjs
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

if (!(await columnExists("users", "is_admin"))) {
  await sql`ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false`;
  console.log("Added users.is_admin");
} else {
  console.log("users.is_admin already exists");
}

if (!(await columnExists("users", "must_reset_password"))) {
  await sql`ALTER TABLE users ADD COLUMN must_reset_password BOOLEAN NOT NULL DEFAULT false`;
  console.log("Added users.must_reset_password");
} else {
  console.log("users.must_reset_password already exists");
}

await sql`
  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
    resolved_at TEXT
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx
    ON password_reset_requests (user_id, created_at DESC)
`;
console.log("Ensured password_reset_requests");

await sql`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('forgot_password', 'admin_reset')),
    issued_by_admin_id TEXT REFERENCES users (id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
    ON password_reset_tokens (user_id, created_at DESC)
`;
console.log("Ensured password_reset_tokens");

await sql`
  INSERT INTO schema_migrations (version) VALUES (47)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete (version 47).");
await sql.end();
