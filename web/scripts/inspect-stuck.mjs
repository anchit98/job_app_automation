import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const p = await sql.unsafe(
  `SELECT status, current_stage, stages_json, error FROM pipeline_runs WHERE id=$1`,
  ["28565af0-6efd-4da1-ac5f-fcee7ec7a8e9"],
);
const stages = JSON.parse(p[0].stages_json);
console.log("status", p[0].status, "stage", p[0].current_stage, "error", p[0].error);
for (const s of stages) {
  console.log("-", s.id, s.status, s.detail || "", s.error || "");
}
const appId = (
  await sql.unsafe(
    `SELECT application_id FROM pipeline_runs WHERE id=$1`,
    ["28565af0-6efd-4da1-ac5f-fcee7ec7a8e9"],
  )
)[0].application_id;
const emails = await sql.unsafe(
  `SELECT id, draft_status, draft_error, left(subject,50) as sub FROM emails WHERE application_id=$1`,
  [appId],
);
console.log("EMAILS", JSON.stringify(emails, null, 2));
const cl = await sql.unsafe(
  `SELECT version, status, drive_pdf_id IS NOT NULL as has_pdf FROM cover_letter_versions WHERE application_id=$1`,
  [appId],
);
console.log("COVER", JSON.stringify(cl, null, 2));
await sql.end({ timeout: 5 });
