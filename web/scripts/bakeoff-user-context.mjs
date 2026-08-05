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

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const apps = await sql`
  SELECT id, user_id, company, role
  FROM applications
  WHERE id IN (
    '0b94937a-4e41-49cf-971f-c8962c5e38ff',
    '7ed22488-b29c-4623-80ee-2127cf168107'
  )
`;
console.log("apps", apps);
const profiles = await sql`SELECT user_id, full_name FROM profiles`;
console.log("profiles", profiles);
const mr = await sql`
  SELECT user_id, doc_id IS NOT NULL AS has_doc, doc_layout IS NOT NULL AS has_layout
  FROM master_resume
`;
console.log("master_resume", mr);
const mc = await sql`
  SELECT user_id, doc_id IS NOT NULL AS has_doc, doc_layout IS NOT NULL AS has_layout
  FROM master_cover_letter
`;
console.log("master_cover_letter", mc);
const tokens = await sql`
  SELECT user_id, status, expires_at FROM google_tokens
`;
console.log("google_tokens", tokens);
await sql.end();
