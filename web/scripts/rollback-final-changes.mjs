/**
 * Undo migrations 050-053.
 *
 * Default is the reversible half — it puts AI behaviour and query planning back
 * exactly where they were, and touches no data:
 *
 *   052  reactivate whichever jd_parse template was active before (from the
 *        snapshot migrate-final-changes.mjs wrote), deactivate jd_parse_v2
 *   050  drop the two trigram indexes
 *
 * The other two halves are opt-in because they destroy things:
 *
 *   --drop-column     drops the latex_content columns from both
 *                     cover_letter_versions and resume_versions. Every
 *                     document built by the new code loses the source its PDF
 *                     is rebuilt from. Only do this if you are also reverting
 *                     the code, and accept that those PDFs become Drive-only.
 *   --drop-extension  drops pg_trgm. Skip it if anything else in the database
 *                     uses trigrams.
 *
 * Leaving the column and the extension in place is harmless: an unused column
 * costs nothing, and the old code never looks at either.
 *
 * Usage:
 *   node scripts/rollback-final-changes.mjs                    # safe reverse
 *   node scripts/rollback-final-changes.mjs --drop-column
 *   node scripts/rollback-final-changes.mjs --drop-column --drop-extension
 *   node scripts/rollback-final-changes.mjs --dry-run          # show only
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

const args = new Set(process.argv.slice(2));
const dropColumn = args.has("--drop-column");
const dropExtension = args.has("--drop-extension");
const dryRun = args.has("--dry-run");

const SNAPSHOT_PATH = path.join(__dirname, "../db/.pre-050-snapshot.json");

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 60,
});

const did = [];
const skipped = [];

async function step(label, fn) {
  if (dryRun) {
    skipped.push(`${label} (dry run)`);
    return;
  }
  try {
    await fn();
    did.push(label);
  } catch (error) {
    skipped.push(`${label} — FAILED: ${error.message}`);
  }
}

try {
  // --- 052: prompt template -------------------------------------------------
  let previousActive = null;
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    previousActive = snapshot.jd_parse_active_id ?? null;
    console.log(`Snapshot found — jd_parse was: ${previousActive ?? "(none active)"}`);
  } else {
    console.log(
      "No snapshot file. Falling back to the highest jd_parse version below v2.",
    );
    const [fallback] = await sql`
      SELECT id FROM prompt_templates
       WHERE kind = 'jd_parse' AND id <> 'jd_parse_v2'
       ORDER BY version DESC LIMIT 1`;
    previousActive = fallback?.id ?? null;
  }

  if (previousActive) {
    await step(`052 reactivate ${previousActive}`, async () => {
      await sql`UPDATE prompt_templates SET active = 0 WHERE kind = 'jd_parse'`;
      await sql`UPDATE prompt_templates SET active = 1 WHERE id = ${previousActive}`;
    });
  } else {
    skipped.push("052 — no earlier jd_parse template to restore");
  }

  // --- 050: indexes ---------------------------------------------------------
  await step("050 drop applications_company_role_trgm_idx", async () => {
    await sql`DROP INDEX IF EXISTS applications_company_role_trgm_idx`;
  });
  await step("050 drop applications_search_haystack_trgm_idx", async () => {
    await sql`DROP INDEX IF EXISTS applications_search_haystack_trgm_idx`;
  });

  // --- opt-in destructive ---------------------------------------------------
  if (dropColumn) {
    const [covers] = await sql`
      SELECT COUNT(*)::int AS n FROM cover_letter_versions
       WHERE latex_content IS NOT NULL`;
    const [resumes] = await sql`
      SELECT COUNT(*)::int AS n FROM resume_versions
       WHERE latex_content IS NOT NULL`;
    console.log(
      `
--drop-column: ${covers?.n ?? 0} cover letter(s) and ${resumes?.n ?? 0} resume(s) carry LaTeX source.`,
    );
    await step("051 drop cover_letter_versions.latex_content", async () => {
      await sql`ALTER TABLE cover_letter_versions DROP COLUMN IF EXISTS latex_content`;
    });
    await step("053 drop resume_versions.latex_content", async () => {
      await sql`ALTER TABLE resume_versions DROP COLUMN IF EXISTS latex_content`;
    });
  } else {
    skipped.push("051/053 columns kept (pass --drop-column to remove them)");
  }

  if (dropExtension) {
    await step("050 drop extension pg_trgm", async () => {
      await sql`DROP EXTENSION IF EXISTS pg_trgm`;
    });
  } else {
    skipped.push("050 pg_trgm kept (pass --drop-extension to remove it)");
  }

  // --- report ---------------------------------------------------------------
  console.log("\nDone:");
  for (const d of did) console.log(`  ${d}`);
  console.log("Skipped:");
  for (const s of skipped) console.log(`  ${s}`);

  const [trgm] = await sql`SELECT 1 ok FROM pg_extension WHERE extname = 'pg_trgm'`;
  const [col] = await sql`
    SELECT 1 ok FROM information_schema.columns
     WHERE table_name = 'cover_letter_versions' AND column_name = 'latex_content'`;
  const [rcol] = await sql`
    SELECT 1 ok FROM information_schema.columns
     WHERE table_name = 'resume_versions' AND column_name = 'latex_content'`;
  const [tmpl] = await sql`
    SELECT id, version FROM prompt_templates WHERE kind = 'jd_parse' AND active = 1`;
  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'applications' AND indexname LIKE '%trgm%'`;

  console.log("\nState now:");
  console.log(`  pg_trgm                : ${trgm ? "enabled" : "absent"}`);
  console.log(`  cover latex_content    : ${col ? "present" : "absent"}`);
  console.log(`  resume latex_content   : ${rcol ? "present" : "absent"}`);
  console.log(`  active jd_parse        : ${tmpl?.id ?? "none"} (v${tmpl?.version ?? "?"})`);
  console.log(`  trigram indexes        : ${idx.length ? idx.map((i) => i.indexname).join(", ") : "none"}`);
} finally {
  await sql.end();
}
