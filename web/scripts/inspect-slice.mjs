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
const pid = "ea9bc845-314a-4027-9230-3f0e6b080949";

const run = (await sql`SELECT * FROM pipeline_runs WHERE id = ${pid}`)[0];
if (!run) {
  console.log("pipeline not found");
  await sql.end();
  process.exit(1);
}

const stages =
  typeof run.stages_json === "string"
    ? JSON.parse(run.stages_json)
    : run.stages_json;

function ageSec(ts) {
  const iso = String(ts).includes("T")
    ? String(ts)
    : `${String(ts).replace(" ", "T")}Z`;
  return Math.round((Date.now() - Date.parse(iso)) / 1000);
}

console.log(
  JSON.stringify(
    {
      status: run.status,
      current: run.current_stage,
      error: run.error,
      created: run.created_at,
      updated: run.updated_at,
      age_since_update_sec: ageSec(run.updated_at),
      stages: stages.map((s) => ({
        id: s.id,
        status: s.status,
        detail: s.detail,
        error: s.error,
        prompt: s.prompt_run_id,
      })),
    },
    null,
    2,
  ),
);

const promptIds = stages.map((s) => s.prompt_run_id).filter(Boolean);
if (promptIds.length) {
  const prompts = await sql`
    SELECT id, kind, status, exported_at, completed_at,
           left(coalesce(raw_response, ''), 180) AS raw_head
    FROM prompt_runs
    WHERE id = ANY(${promptIds})
  `;
  console.log("prompts:", prompts);
}

const app = (
  await sql`
    SELECT id, company, role, status, created_at, updated_at
    FROM applications WHERE id = ${run.application_id}
  `
)[0];
console.log("app:", app);

const contacts = await sql`
  SELECT id, name, email, role FROM contacts
  WHERE application_id = ${run.application_id}
`;
console.log("contacts:", contacts);

const emails = await sql`
  SELECT id, subject, status, created_at FROM emails
  WHERE application_id = ${run.application_id}
  ORDER BY created_at
`;
console.log("emails:", emails.length, emails);

await sql.end();
