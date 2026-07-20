import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const pipeId = "61fe0830-cc69-4878-adcb-12719d0ca215";
const promptId = "960e5951-601b-4abf-a1ab-54ba681700a6";

const pipe = await sql.unsafe(
  `SELECT id, status, current_stage, stages_json FROM pipeline_runs WHERE id = $1`,
  [pipeId],
);
console.log("PIPELINE", JSON.stringify(pipe[0], null, 2));

const pending = await sql.unsafe(
  `SELECT prompt_run_id, status, wake_until, kind, error, created_at, updated_at
   FROM pending_extension_runs ORDER BY updated_at DESC LIMIT 5`,
);
console.log("PENDING", JSON.stringify(pending, null, 2));

const pr = await sql.unsafe(
  `SELECT id, kind, status, length(prompt_text) as prompt_len FROM prompt_runs WHERE id = $1`,
  [promptId],
);
console.log("PROMPT", JSON.stringify(pr, null, 2));

const tok = await sql.unsafe(
  `SELECT token_prefix, revoked_at FROM extension_tokens WHERE id = 1`,
);
console.log("TOKEN", JSON.stringify(tok, null, 2));

// Test arm SQL rowcount
const armTest = await sql.unsafe(
  `UPDATE pending_extension_runs
   SET wake_until = (NOW() AT TIME ZONE 'utc' + ($1::text)::interval)::text,
       updated_at = (NOW() AT TIME ZONE 'utc')::text
   WHERE prompt_run_id = $2 AND status IN ('pending', 'claimed')`,
  ["+300 seconds", promptId],
);
console.log("ARM count=", armTest.count, "rows=", armTest.length);

const after = await sql.unsafe(
  `SELECT prompt_run_id, status, wake_until FROM pending_extension_runs WHERE prompt_run_id = $1`,
  [promptId],
);
console.log("AFTER ARM", JSON.stringify(after, null, 2));

await sql.end({ timeout: 5 });
