import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const id = process.argv[2] || "50829d96-3b10-42c0-b332-29ff6af8df19";

const r = await sql.unsafe(
  `UPDATE pending_extension_runs
   SET wake_until = ((NOW() AT TIME ZONE 'utc') + make_interval(secs => 600))::text,
       status = 'pending',
       error = NULL,
       updated_at = (NOW() AT TIME ZONE 'utc')::text
   WHERE prompt_run_id = $1
     AND status IN ('pending', 'claimed')`,
  [id],
);
console.log("rearmed count", r.count);

const row = await sql.unsafe(
  `SELECT prompt_run_id, status, wake_until, kind FROM pending_extension_runs WHERE prompt_run_id = $1`,
  [id],
);
console.log(JSON.stringify(row, null, 2));
await sql.end({ timeout: 5 });
