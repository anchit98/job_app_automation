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
const appId = "0b94937a-4e41-49cf-971f-c8962c5e38ff";

const fus = await sql`
  SELECT fu.*, c.name AS contact_name, e.subject AS cold_subject
  FROM follow_ups fu
  JOIN emails e ON e.id = fu.email_id
  JOIN contacts c ON c.id = e.contact_id
  WHERE fu.application_id = ${appId}
  ORDER BY fu.sequence, c.name
`;
console.log(JSON.stringify(fus, null, 2));

if (fus[0]?.prompt_run_id) {
  const run = await sql`SELECT id, kind, status, left(prompt_text, 200) as prompt_preview FROM prompt_runs WHERE id = ${fus[0].prompt_run_id}`;
  console.log("PROMPT_RUN", JSON.stringify(run, null, 2));
}

await sql.end();
