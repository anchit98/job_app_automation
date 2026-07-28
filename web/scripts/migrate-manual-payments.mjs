/**
 * Manual UPI payments + paid access gate.
 * Run: node scripts/migrate-manual-payments.mjs
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

if (!(await columnExists("users", "is_paid"))) {
  await sql`ALTER TABLE users ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false`;
  console.log("Added users.is_paid");
} else {
  console.log("users.is_paid already exists");
}

if (!(await columnExists("users", "paid_at"))) {
  await sql`ALTER TABLE users ADD COLUMN paid_at TEXT`;
  console.log("Added users.paid_at");
} else {
  console.log("users.paid_at already exists");
}

// Existing accounts keep access; new signups stay unpaid until admin approves.
await sql`
  UPDATE users
     SET is_paid = true,
         paid_at = COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
   WHERE is_paid = false
`;
console.log("Marked existing users as paid");

await sql`
  UPDATE users
     SET is_paid = true,
         paid_at = COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
   WHERE is_admin = true AND is_paid = false
`;

await sql`
  CREATE TABLE IF NOT EXISTS payment_claims (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    upi_reference TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_admin_id TEXT REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text)
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS payment_claims_user_idx
    ON payment_claims (user_id, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS payment_claims_status_idx
    ON payment_claims (status, created_at DESC)
`;
console.log("Ensured payment_claims");

await sql`
  INSERT INTO schema_migrations (version) VALUES (48)
  ON CONFLICT (version) DO NOTHING
`;

console.log("Migration complete (version 48).");
await sql.end();
