/**
 * Activate resume prompt template v30 (JD-framed grounded rewrite).
 * Usage: node scripts/activate-resume-v30.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing in web/.env.local");
  process.exit(1);
}

const templates = JSON.parse(
  fs.readFileSync(path.join(__dirname, "_prompt_templates.json"), "utf8"),
);
const resume = templates.find((t) => t.id === "resume_v30_gdoc");
if (!resume) {
  console.error("resume_v30_gdoc not found in _prompt_templates.json");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

await sql`UPDATE prompt_templates SET active = 0 WHERE kind = 'resume' AND active = 1`;

await sql`
  INSERT INTO prompt_templates (id, kind, version, body, variables, output_schema, active, notes, created_at)
  VALUES (
    ${resume.id},
    ${resume.kind},
    ${resume.version},
    ${resume.body},
    ${resume.variables},
    ${resume.output_schema},
    1,
    ${resume.notes},
    ${resume.created_at}
  )
  ON CONFLICT (id) DO UPDATE SET
    body = EXCLUDED.body,
    variables = EXCLUDED.variables,
    output_schema = EXCLUDED.output_schema,
    active = 1,
    notes = EXCLUDED.notes,
    version = EXCLUDED.version
`;

const check = await sql`
  SELECT id, version, active, notes
  FROM prompt_templates
  WHERE kind = 'resume' AND active = 1
`;
console.log("Active resume template:", check);
await sql.end();
