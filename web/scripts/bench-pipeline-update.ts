/**
 * Measure what the one-round-trip updatePipelineRun actually saves.
 *
 * Times the new implementation against the read-write-read the old one did,
 * on a throwaway row, then scales it by how many times a single Apply calls
 * the function.
 *
 * Usage: npx tsx scripts/bench-pipeline-update.ts
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

const ROUNDS = 12;
/** Counted from the call sites in src/app/actions/pipeline.ts. */
const CALLS_PER_APPLY = 25;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
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
      (id, user_id, application_id, status, current_stage, stages_json, contacts_json)
    VALUES (${id}, ${seed.user_id}, ${seed.application_id}, 'running', 'jd_parse',
            ${JSON.stringify(stages)}, '[]')`;

  try {
    await updatePipelineRun(id, { status: "running" }); // warm the pool

    const now: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const t = Date.now();
      await updatePipelineRun(id, {
        status: "running",
        stages,
        error: null,
      });
      now.push(Date.now() - t);
    }

    // Exactly what the previous implementation did: read, write, read.
    const before: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const t = Date.now();
      await getPipelineRunById(id, seed.user_id);
      await sql`
        UPDATE pipeline_runs
           SET status = 'running', current_stage = 'jd_parse',
               stages_json = ${JSON.stringify(stages)}, error = NULL,
               updated_at = (NOW() AT TIME ZONE 'utc')::text
         WHERE id = ${id}`;
      await getPipelineRunById(id, seed.user_id);
      before.push(Date.now() - t);
    }

    const m0 = median(before);
    const m1 = median(now);
    console.log(`\n  old (read + write + read) : ${m0} ms median`);
    console.log(`  new (UPDATE … RETURNING)  : ${m1} ms median`);
    console.log(`  saved per call            : ${m0 - m1} ms`);
    console.log(
      `\n  × ${CALLS_PER_APPLY} calls in one Apply     : ${(((m0 - m1) * CALLS_PER_APPLY) / 1000).toFixed(1)}s saved per run`,
    );
  } finally {
    await sql`DELETE FROM pipeline_runs WHERE id = ${id}`;
    console.log("\n  throwaway row deleted.");
  }
  process.exit(0);
}

void main();
