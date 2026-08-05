/**
 * Recover PhonePe Growth pipeline that falsely failed after cover letter saved.
 * Marks cover_letter completed and sets pipeline running at cold_email.
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
const pipelineId = "58904dd1-e92e-4940-a987-42e46006c045";

const rows = await sql`
  SELECT id, status, current_stage, stages_json, error
  FROM pipeline_runs
  WHERE id = ${pipelineId}
`;
if (!rows.length) {
  console.log("Pipeline not found");
  await sql.end();
  process.exit(1);
}

const run = rows[0];
const stages = JSON.parse(run.stages_json);
for (const s of stages) {
  if (s.id === "cover_letter") {
    s.status = "completed";
    s.error = null;
    s.detail = "Done";
  }
}

await sql`
  UPDATE pipeline_runs
  SET status = 'running',
      current_stage = 'cold_email',
      error = NULL,
      stages_json = ${JSON.stringify(stages)},
      updated_at = (NOW() AT TIME ZONE 'utc')::text
  WHERE id = ${pipelineId}
`;

console.log(
  "Recovered pipeline",
  pipelineId,
  "-> running at cold_email (cover_letter marked completed).",
);
console.log("Open the pipeline page and it should continue, or click Retry.");

await sql.end();
