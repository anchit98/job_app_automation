import fs from "fs";
import path from "path";
import postgres from "postgres";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const mig = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/045_cover_signoff_resume_replace.sql"),
  "utf8",
);
await sql.unsafe(mig);
const rows = await sql`
  SELECT id, kind, version, active, left(notes, 90) AS notes
  FROM prompt_templates
  WHERE kind IN ('cover_letter', 'resume') AND active = 1
  ORDER BY kind
`;
console.log(rows);
await sql.end();
