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
  SELECT id, company, role, status, created_at
  FROM applications
  WHERE company ILIKE '%slice%'
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log("apps:", apps);

for (const a of apps) {
  const pipes = await sql`
    SELECT id, status, current_stage, error, stages_json, updated_at
    FROM pipeline_runs
    WHERE application_id = ${a.id}
    ORDER BY created_at DESC
  `;
  for (const p of pipes) {
    const stages =
      typeof p.stages_json === "string"
        ? JSON.parse(p.stages_json)
        : p.stages_json;
    console.log("pipeline", {
      id: p.id,
      status: p.status,
      current: p.current_stage,
      error: p.error,
      updated: p.updated_at,
      stages: stages.map((s) => ({
        id: s.id,
        status: s.status,
        detail: s.detail,
        error: s.error,
      })),
    });

    if (
      p.status === "running" ||
      p.status === "awaiting_chatgpt" ||
      (p.status !== "failed" &&
        p.status !== "completed" &&
        stages.some(
          (s) => s.status === "running" || s.status === "awaiting_chatgpt",
        ))
    ) {
      const next = stages.map((s) =>
        s.status === "running" || s.status === "awaiting_chatgpt"
          ? {
              ...s,
              status: "failed",
              error: "This took too long. Please retry.",
              detail: "Failed",
            }
          : s,
      );
      const failedStage =
        next.find((s) => s.status === "failed")?.id ?? p.current_stage;
      await sql`
        UPDATE pipeline_runs
        SET status = 'failed',
            current_stage = ${failedStage},
            error = ${"This took too long. Please retry."},
            stages_json = ${JSON.stringify(next)},
            updated_at = NOW()
        WHERE id = ${p.id}
      `;
      console.log("cleared stuck pipeline", p.id);
    }
  }
}

await sql.end();
