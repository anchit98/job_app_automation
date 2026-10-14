/**
 * Apply migrations 050–052.
 *
 *   050  pg_trgm + search indexes  — fuzzy/partial search on the Jobs page
 *   051  cover_letter_versions.latex_content — LaTeX-built cover letters
 *   052  jd_parse_v2 prompt template — exhaustive keyword extraction
 *   053  resume_versions.latex_content — LaTeX-typeset tailored resumes
 *
 * Each is written to be safe to re-run. 050 will warn rather than fail if the
 * database does not allow CREATE EXTENSION: the search query probes for
 * pg_trgm at runtime and falls back to substring matching without it.
 *
 * Usage: node scripts/migrate-final-changes.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing in web/.env.local");
  process.exit(1);
}

const MIGRATIONS = [
  { file: "050_search_trigram.sql", optional: true },
  { file: "051_cover_letter_latex.sql", optional: false },
  { file: "052_jd_parse_v2.sql", optional: false },
  { file: "053_resume_latex.sql", optional: false },
];

const SNAPSHOT_PATH = path.join(__dirname, "../db/.pre-050-snapshot.json");

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 60,
});

try {
  // Record what we are about to change, before we change it. The only thing
  // these migrations overwrite rather than add is the active jd_parse
  // template, so that is what the rollback needs to put back.
  const [beforeActive] = await sql`
    SELECT id, version FROM prompt_templates
     WHERE kind = 'jd_parse' AND active = 1`;
  const [beforeCol] = await sql`
    SELECT 1 AS ok FROM information_schema.columns
     WHERE table_name = 'cover_letter_versions' AND column_name = 'latex_content'`;
  const [beforeTrgm] = await sql`
    SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm'`;

  // Written once and never overwritten. Re-running the migration would
  // otherwise snapshot the already-migrated state, and the rollback would
  // faithfully "restore" the very thing it is meant to undo.
  if (fs.existsSync(SNAPSHOT_PATH)) {
    console.log(
      "Snapshot already exists — keeping the original pre-migration state.\n",
    );
  } else {
    fs.writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify(
        {
          taken_at: new Date().toISOString(),
          jd_parse_active_id: beforeActive?.id ?? null,
          jd_parse_active_version: beforeActive?.version ?? null,
          latex_content_existed: Boolean(beforeCol),
          pg_trgm_existed: Boolean(beforeTrgm),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    console.log(`Snapshot written to db/.pre-050-snapshot.json`);
    console.log(`  jd_parse was: ${beforeActive?.id ?? "(none active)"}`);
    console.log(
      `  latex_content existed: ${Boolean(beforeCol)} · pg_trgm existed: ${Boolean(beforeTrgm)}\n`,
    );
  }

  for (const { file, optional } of MIGRATIONS) {
    const text = fs.readFileSync(
      path.join(__dirname, "../db/migrations", file),
      "utf8",
    );
    try {
      await sql.unsafe(text);
      console.log(`Applied ${file}`);
    } catch (error) {
      if (!optional) throw error;
      console.warn(`Skipped ${file}: ${error.message}`);
      console.warn(
        "  Search still works — it falls back to substring matching.",
      );
    }
  }

  const [trgm] = await sql`
    SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm'`;
  console.log(`  pg_trgm: ${trgm ? "enabled" : "not installed"}`);

  const [column] = await sql`
    SELECT 1 AS ok
      FROM information_schema.columns
     WHERE table_name = 'cover_letter_versions'
       AND column_name = 'latex_content'`;
  console.log(`  cover_letter_versions.latex_content: ${column ? "present" : "MISSING"}`);

  const [resumeColumn] = await sql`
    SELECT 1 AS ok
      FROM information_schema.columns
     WHERE table_name = 'resume_versions'
       AND column_name = 'latex_content'`;
  console.log(`  resume_versions.latex_content:       ${resumeColumn ? "present" : "MISSING"}`);

  const [template] = await sql`
    SELECT id, version FROM prompt_templates
     WHERE kind = 'jd_parse' AND active = 1`;
  console.log(
    `  active jd_parse template: ${template?.id ?? "none"} (v${template?.version ?? "?"})`,
  );
} finally {
  await sql.end();
}
