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

const dups = await sql`
  SELECT target_entity_id AS application_id,
         kind,
         COUNT(*)::int AS n,
         array_agg(id ORDER BY exported_at) AS prompt_ids,
         array_agg(status ORDER BY exported_at) AS statuses,
         array_agg(exported_at ORDER BY exported_at) AS exported_ats
  FROM prompt_runs
  WHERE kind IN ('jd_parse', 'resume', 'cover_letter', 'cold_email')
    AND target_entity_id IS NOT NULL
    AND exported_at::timestamp > (NOW() AT TIME ZONE 'utc') - INTERVAL '7 days'
  GROUP BY target_entity_id, kind
  HAVING COUNT(*) > 1
  ORDER BY MAX(exported_at) DESC
  LIMIT 40
`;

console.log("DUPLICATE PROMPT KINDS (last 7d):\n", JSON.stringify(dups, null, 2));

const recent = await sql`
  SELECT a.id, a.company, a.role, a.created_at
  FROM applications a
  ORDER BY a.created_at DESC
  LIMIT 8
`;

for (const a of recent) {
  const prompts = await sql`
    SELECT id, kind, status, exported_at, completed_at
    FROM prompt_runs
    WHERE target_entity_id = ${a.id}
    ORDER BY exported_at NULLS LAST, created_at
  `;
  const audits = await sql`
    SELECT action, entity_id, payload, created_at
    FROM audit_log
    WHERE action = 'prompt.exported'
      AND payload ILIKE ${"%" + a.id + "%"}
    ORDER BY created_at
  `;
  console.log("\n====", a.company, "|", a.role, "|", a.id, "|", a.created_at);
  console.log("prompts:", JSON.stringify(prompts, null, 2));
  console.log(
    "exports:",
    audits.map((x) => ({
      t: x.created_at,
      id: x.entity_id,
      kind: (() => {
        try {
          return JSON.parse(x.payload).kind;
        } catch {
          return "?";
        }
      })(),
    })),
  );
}

await sql.end();
