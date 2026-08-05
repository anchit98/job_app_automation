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
const pid = "72d9a15b-f159-44f3-ac40-44b5b995a264";

const run = (await sql`SELECT * FROM pipeline_runs WHERE id = ${pid}`)[0];
if (!run) {
  console.log("not found");
  await sql.end();
  process.exit(0);
}

const stages =
  typeof run.stages_json === "string"
    ? JSON.parse(run.stages_json)
    : run.stages_json;

const next = stages.map((s) =>
  s.id === "resume" &&
  (s.status === "running" || s.status === "awaiting_chatgpt" || s.status === "failed")
    ? {
        ...s,
        status: "failed",
        error: "This took too long. Please retry.",
        detail: "Failed",
      }
    : s,
);

await sql`
  UPDATE pipeline_runs
  SET status = 'failed',
      current_stage = 'resume',
      error = ${"This took too long. Please retry."},
      stages_json = ${JSON.stringify(next)},
      updated_at = NOW()
  WHERE id = ${pid}
`;

console.log("PhonePe pipeline cleared — use Retry on resume.");
await sql.end();
