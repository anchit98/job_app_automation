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

const apps = await sql`
  SELECT id, company, role, status, created_at, updated_at
  FROM applications
  ORDER BY created_at DESC
  LIMIT 5
`;

for (const a of apps) {
  const pipes = await sql`
    SELECT id, status, current_stage, error, stages_json, created_at, updated_at
    FROM pipeline_runs
    WHERE application_id = ${a.id}
    ORDER BY created_at DESC
  `;
  const prompts = await sql`
    SELECT id, kind, status, exported_at, completed_at
    FROM prompt_runs
    WHERE target_entity_id = ${a.id}
    ORDER BY exported_at NULLS LAST, created_at
  `;
  console.log("\n====", a.company, "|", a.role);
  console.log("app:", a.id, a.status, a.created_at);
  for (const p of pipes) {
    let stages;
    try {
      stages = JSON.parse(p.stages_json);
    } catch {
      stages = [];
    }
    console.log("pipeline:", {
      id: p.id,
      status: p.status,
      current: p.current_stage,
      error: p.error,
      created: p.created_at,
      updated: p.updated_at,
      stages: stages.map((s) => ({
        id: s.id,
        status: s.status,
        error: s.error,
        detail: s.detail,
        prompt: s.prompt_run_id?.slice?.(0, 8),
      })),
    });
  }
  console.log(
    "prompts:",
    prompts.map((x) => `${x.kind}:${x.status}@${x.exported_at}`),
  );
}

const pendingExt = await sql`
  SELECT prompt_run_id, pipeline_run_id, kind, status, wake_until, error, updated_at
  FROM pending_extension_runs
  ORDER BY updated_at DESC
  LIMIT 15
`;
console.log("\npending_extension_runs:", pendingExt);

await sql.end();
