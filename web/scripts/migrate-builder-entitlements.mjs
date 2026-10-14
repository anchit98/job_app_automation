/**
 * Apply 047_builder_and_entitlements.sql.
 *
 * Additive only: creates user_entitlements, builder_profiles and
 * builder_cv_versions, then grandfathers every existing paid/admin account
 * onto `legacy_lifetime` so the new free tier cannot take anything away.
 *
 * Usage: node scripts/migrate-builder-entitlements.mjs
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
  path.join(__dirname, "../db/migrations/047_builder_and_entitlements.sql"),
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

  const [{ count: entitled }] = await sql`
    SELECT count(*)::int AS count FROM user_entitlements`;
  const rows = await sql`
    SELECT plan, count(*)::int AS users FROM user_entitlements GROUP BY plan ORDER BY plan`;
  console.log(`user_entitlements rows: ${entitled}`);
  for (const r of rows) console.log(`  ${r.plan}: ${r.users}`);

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('user_entitlements','builder_profiles','builder_cv_versions')
     ORDER BY table_name`;
  console.log("tables:", tables.map((t) => t.table_name).join(", "));
} finally {
  await sql.end();
}
