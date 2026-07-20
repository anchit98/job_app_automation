import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const pipes = await sql.unsafe(
  `SELECT id, status, current_stage, left(stages_json, 800) as stages, error, updated_at
   FROM pipeline_runs ORDER BY updated_at DESC LIMIT 3`,
);
console.log("PIPES", JSON.stringify(pipes, null, 2));

const pending = await sql.unsafe(
  `SELECT prompt_run_id, status, wake_until, kind, error, updated_at
   FROM pending_extension_runs ORDER BY updated_at DESC LIMIT 8`,
);
console.log("PENDING", JSON.stringify(pending, null, 2));

const resumes = await sql.unsafe(
  `SELECT id, application_id, version, status, prompt_run_id, drive_pdf_id, left(coalesce(content,'')::text, 40) as c
   FROM resume_versions ORDER BY created_at DESC LIMIT 5`,
);
console.log("RESUMES", JSON.stringify(resumes, null, 2));

const prompts = await sql.unsafe(
  `SELECT id, kind, status, length(prompt_text) as len, completed_at
   FROM prompt_runs ORDER BY exported_at DESC LIMIT 8`,
);
console.log("PROMPTS", JSON.stringify(prompts, null, 2));

// Test wake_until comparison that consume uses
const wakeCheck = await sql.unsafe(
  `SELECT prompt_run_id, status, wake_until,
          (wake_until::timestamptz) as wake_ts,
          (NOW() AT TIME ZONE 'utc') as now_utc,
          (wake_until::timestamptz) > (NOW() AT TIME ZONE 'utc') as is_active
   FROM pending_extension_runs
   WHERE status IN ('pending','claimed')
   ORDER BY updated_at DESC LIMIT 5`,
);
console.log("WAKE_CHECK", JSON.stringify(wakeCheck, null, 2));

await sql.end({ timeout: 5 });
