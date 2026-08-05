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
const appId = "3de718f7-b494-4a70-bdf1-4be0faf357fb";

const cols = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'prompt_runs'
  ORDER BY ordinal_position
`;
console.log("prompt_runs cols:", cols.map((c) => c.column_name).join(", "));

const prompts = await sql`
  SELECT *
  FROM prompt_runs
  WHERE target_entity_id = ${appId}
  ORDER BY created_at
`;
for (const p of prompts) {
  const { prompt_text, raw_response, parsed_json, ...rest } = p;
  console.log("\nPROMPT", rest.kind, rest.id);
  console.log(rest);
  if (raw_response) {
    console.log("raw_response preview:", String(raw_response).slice(0, 600));
  }
  if (parsed_json) {
    console.log("parsed_json preview:", JSON.stringify(parsed_json).slice(0, 600));
  }
  if (rest.validation_errors) {
    console.log("validation_errors:", rest.validation_errors);
  }
}

const versions = await sql`
  SELECT id, version, status, prompt_run_id, drive_doc_id, drive_pdf_id, created_at,
         LEFT(content::text, 500) AS preview
  FROM cover_letter_versions
  WHERE application_id = ${appId}
  ORDER BY version
`;
console.log("\ncover_letter_versions:", versions);

const resumes = await sql`
  SELECT id, version, status, prompt_run_id, drive_doc_id, drive_pdf_id, created_at
  FROM resume_versions
  WHERE application_id = ${appId}
  ORDER BY version
`;
console.log("\nresume_versions:", resumes);

await sql.end();
