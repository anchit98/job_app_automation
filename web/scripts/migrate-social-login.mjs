/**
 * Apply 054_social_login.sql.
 *
 * Additive apart from one relaxation: `users.password_hash` loses NOT NULL, so
 * an account created through Google can honestly record that it has no
 * password. Nothing existing changes — every current row keeps its hash.
 *
 * Usage: node scripts/migrate-social-login.mjs
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
  path.join(__dirname, "../db/migrations/054_social_login.sql"),
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
  const [{ nullable }] = await sql`
    SELECT is_nullable = 'YES' AS nullable
      FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'password_hash'`;
  console.log(`  users.password_hash nullable: ${nullable}`);
  const [{ identities }] = await sql`
    SELECT count(*)::int AS identities FROM user_identities`;
  console.log(`  user_identities rows: ${identities}`);
} finally {
  await sql.end();
}
