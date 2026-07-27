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

// RockED: failed gmail_drafts → pending so resume can retry
const rocked = await sql`
  UPDATE pipeline_runs
  SET status = 'running',
      error = NULL,
      stages_json = (
        SELECT jsonb_agg(
          CASE
            WHEN elem->>'id' = 'gmail_drafts'
              THEN jsonb_set(
                jsonb_set(elem, '{status}', '"pending"'),
                '{error}',
                'null'
              )
            ELSE elem
          END
        )::text
        FROM jsonb_array_elements(stages_json::jsonb) elem
      ),
      updated_at = (NOW() AT TIME ZONE 'utc')::text
  WHERE id = 'e8b409b4-a240-4c66-b3eb-7cb9afdcf740'
  RETURNING id, status, current_stage
`;

// Zynga: stuck gmail_drafts running → pending
const zynga = await sql`
  UPDATE pipeline_runs
  SET status = 'running',
      error = NULL,
      stages_json = (
        SELECT jsonb_agg(
          CASE
            WHEN elem->>'id' = 'gmail_drafts'
              THEN jsonb_set(
                jsonb_set(elem, '{status}', '"pending"'),
                '{detail}',
                '"Resumed after interrupted run"'
              )
            ELSE elem
          END
        )::text
        FROM jsonb_array_elements(stages_json::jsonb) elem
      ),
      updated_at = (NOW() AT TIME ZONE 'utc')::text
  WHERE id = 'fb2dc473-64c3-4395-99c5-e950faf29a52'
  RETURNING id, status, current_stage
`;

console.log("RockED reset:", rocked);
console.log("Zynga reset:", zynga);
await sql.end();
