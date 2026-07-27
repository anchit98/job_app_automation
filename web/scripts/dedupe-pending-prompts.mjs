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

// Keep the newest pending prompt per (kind, application); abandon older dups.
const abandoned = await sql`
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY kind, target_entity_id
             ORDER BY exported_at DESC NULLS LAST, created_at DESC
           ) AS rn
    FROM prompt_runs
    WHERE status = 'pending'
      AND target_entity_id IS NOT NULL
      AND kind IN ('jd_parse', 'resume', 'cover_letter')
  )
  UPDATE prompt_runs p
  SET status = 'abandoned'
  FROM ranked r
  WHERE p.id = r.id AND r.rn > 1
  RETURNING p.id, p.kind, p.target_entity_id
`;

console.log("Abandoned duplicate pending prompts:", abandoned.length, abandoned);

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS prompt_runs_one_pending_stage_idx
  ON prompt_runs (kind, target_entity_id)
  WHERE status = 'pending'
    AND target_entity_id IS NOT NULL
    AND kind IN ('jd_parse', 'resume', 'cover_letter')
`;

console.log("Unique index ensured.");
await sql.end();
