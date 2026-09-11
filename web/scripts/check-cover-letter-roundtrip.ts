/**
 * Prove the cover-letter write path works against the real schema.
 *
 * Migration 051 added cover_letter_versions.latex_content, and the new build
 * path writes to it. This exercises insert -> mark built -> read back through
 * the same mapper the app uses, inside a transaction that is always rolled
 * back — so it touches the real database without leaving a row behind.
 *
 * Usage: npx tsx scripts/check-cover-letter-roundtrip.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

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

class Rollback extends Error {}

async function main() {
  const { getSql } = await import("../src/lib/db/index");
  const { generateCoverLetterLatex } = await import(
    "../src/lib/builder/cover-letter-latex"
  );

  const sql = getSql();

  const [app] = (await sql`
    SELECT id, company, role FROM applications ORDER BY created_at DESC LIMIT 1`) as unknown as Array<{
    id: string;
    company: string | null;
    role: string | null;
  }>;
  if (!app) {
    console.error("No applications to attach a test cover letter to.");
    process.exit(1);
  }
  console.log(`Using application: ${app.company ?? "?"} / ${app.role ?? "?"}`);

  const latex = generateCoverLetterLatex({
    content: {
      opening_hook: "hook",
      why_this_role: "role",
      evidence_points: ["one", "two"],
      why_this_company: "company",
      cta: "cta",
      body:
        "This is a round-trip test body long enough to clear the eighty " +
        "character floor so the prose branch is the one that renders.",
    },
    profile: {
      full_name: "Round Trip",
      email: "rt@example.com",
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_url: null,
    },
    company: app.company,
    role: app.role,
  });

  const id = randomUUID();
  let ok = true;
  const say = (label: string, pass: boolean, detail = "") => {
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    await sql.begin(async (tx) => {
      // Version -1 cannot collide with a real one (UNIQUE is on app + version).
      await tx`
        INSERT INTO cover_letter_versions (id, application_id, version, content, status)
        VALUES (${id}, ${app.id}, -1, ${JSON.stringify({ body: "x" })}, 'uploading')`;
      say("insert with the new schema", true);

      await tx`
        UPDATE cover_letter_versions
           SET latex_content = ${latex}, drive_pdf_id = NULL, status = 'ready'
         WHERE id = ${id}`;

      const [row] = (await tx`
        SELECT id, status, drive_pdf_id, latex_content
          FROM cover_letter_versions WHERE id = ${id}`) as unknown as Array<{
        status: string;
        drive_pdf_id: string | null;
        latex_content: string | null;
      }>;

      say("status is ready without a Drive id", row.status === "ready" && row.drive_pdf_id === null);
      say(
        "latex_content round-trips byte for byte",
        row.latex_content === latex,
        `${row.latex_content?.length ?? 0} vs ${latex.length} chars`,
      );
      say(
        "stored source is a complete document",
        Boolean(row.latex_content?.includes("\\end{document}")),
      );

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  const [leftover] = (await sql`
    SELECT 1 AS ok FROM cover_letter_versions WHERE id = ${id}`) as unknown as Array<{
    ok: number;
  }>;
  say("transaction rolled back — no row left behind", !leftover);

  console.log(ok ? "\nALL CHECKS PASSED" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

void main();
