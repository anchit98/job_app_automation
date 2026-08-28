/**
 * Apply 048_master_resume_source.sql.
 *
 * Additive only: three nullable columns on master_resume plus a best-effort
 * backfill for users whose master came from the CV builder.
 *
 * Usage: node scripts/migrate-master-resume-source.mjs
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
  path.join(__dirname, "../db/migrations/048_master_resume_source.sql"),
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
  const rows = await sql`
    SELECT COALESCE(source, '(unknown)') AS source, count(*)::int AS users
      FROM master_resume GROUP BY 1 ORDER BY 1`;
  for (const r of rows) console.log(`  ${r.source}: ${r.users}`);
} finally {
  await sql.end();
}
