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
const pipelineId = "517f0873-469c-482b-b30e-f87c465bc88e";
const appId = "51f9b493-27f8-4f7f-bb7d-7c4108f6c9cb";

const run = await sql`SELECT id, status, current_stage, error, updated_at, stages_json FROM pipeline_runs WHERE id = ${pipelineId}`;
console.log("pipeline", run[0]?.status, run[0]?.current_stage, run[0]?.error, run[0]?.updated_at);
const stages = JSON.parse(run[0].stages_json);
console.log(
  "stages",
  stages.map((s) => ({ id: s.id, status: s.status, detail: s.detail, err: s.error })),
);

const prompts = await sql`
  SELECT id, kind, status, exported_at, completed_at,
         LEFT(COALESCE(validation_errors::text, ''), 300) AS verr
  FROM prompt_runs WHERE target_entity_id = ${appId}
  ORDER BY created_at
`;
console.log("prompts", prompts);

const resumes = await sql`
  SELECT id, version, status, created_at FROM resume_versions WHERE application_id = ${appId}
`;
console.log("resumes", resumes);

const busy = await sql`
  SELECT id, status, current_stage, updated_at
  FROM pipeline_runs
  WHERE status IN ('running', 'awaiting_chatgpt', 'queued')
  ORDER BY updated_at DESC
  LIMIT 10
`;
console.log("busy pipelines", busy);

await sql.end();
