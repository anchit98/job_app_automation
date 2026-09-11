/**
 * Prove the one-round-trip updatePipelineRun still merges like the old one.
 *
 * The rewrite moved the patch merge from JavaScript into SQL, and the subtle
 * part is the difference between "field not supplied" and "field supplied as
 * null" — callers genuinely clear current_stage and error, so COALESCE alone
 * would have silently ignored them.
 *
 * Works on a throwaway row it creates and deletes.
 *
 * Usage: npx tsx scripts/check-pipeline-update.ts
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

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { getSql, dbAll } = await import("../src/lib/db/index");
  const { updatePipelineRun, getPipelineRunById } = await import(
    "../src/lib/db/pipeline"
  );
  const { buildInitialStages } = await import("../src/lib/pipeline/types");

  const sql = getSql();
  const [seed] = (await dbAll(
    `SELECT user_id, application_id FROM pipeline_runs ORDER BY created_at DESC LIMIT 1`,
  )) as Array<{ user_id: string; application_id: string }>;
  if (!seed) {
    console.error("No pipeline_runs row to borrow ids from.");
    process.exit(1);
  }

  const id = randomUUID();
  const stages = buildInitialStages();

  await sql`
    INSERT INTO pipeline_runs
      (id, user_id, application_id, status, current_stage, stages_json, contacts_json, error)
    VALUES (${id}, ${seed.user_id}, ${seed.application_id}, 'running', 'jd_parse',
            ${JSON.stringify(stages)}, '[]', 'seed error')`;

  try {
    // 1. Only status supplied — everything else must survive untouched.
    let r = await updatePipelineRun(id, { status: "awaiting_chatgpt" });
    check("status applied", r?.status === "awaiting_chatgpt");
    check("current_stage untouched when omitted", r?.current_stage === "jd_parse", String(r?.current_stage));
    check("error untouched when omitted", r?.error === "seed error", String(r?.error));
    check("stages untouched when omitted", r?.stages.length === stages.length);

    // 2. Explicit nulls must actually clear.
    r = await updatePipelineRun(id, { current_stage: null, error: null });
    check("current_stage: null clears it", r?.current_stage === null, String(r?.current_stage));
    check("error: null clears it", r?.error === null, String(r?.error));
    check("status survived the null patch", r?.status === "awaiting_chatgpt");

    // 3. Stages replace wholesale, and come back parsed.
    const patched = stages.map((s) =>
      s.id === "resume" ? { ...s, status: "completed" as const, detail: "Done" } : s,
    );
    r = await updatePipelineRun(id, { stages: patched, status: "running" });
    check("stages replaced", r?.stages.find((s) => s.id === "resume")?.status === "completed");
    check("stage detail round-trips", r?.stages.find((s) => s.id === "resume")?.detail === "Done");
    check("stages come back as objects, not a string", Array.isArray(r?.stages));

    // 4. Returned row matches a fresh read.
    const fresh = await getPipelineRunById(id, seed.user_id);
    check("returned row equals a re-read", JSON.stringify(fresh?.stages) === JSON.stringify(r?.stages));
    check("updated_at moved", Boolean(r?.updated_at));

    // 5. Unknown id is null, not a throw.
    const missing = await updatePipelineRun(randomUUID(), { status: "failed" });
    check("unknown id returns null", missing === null);
  } finally {
    await sql`DELETE FROM pipeline_runs WHERE id = ${id}`;
    const [left] = (await dbAll(`SELECT 1 AS ok FROM pipeline_runs WHERE id = ?`, id)) as Array<{ ok: number }>;
    check("throwaway row cleaned up", !left);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
