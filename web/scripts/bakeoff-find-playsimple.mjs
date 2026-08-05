import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(root, ".env.testing.local"));

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const rows = await sql`
  SELECT id, company, role, status, left(coalesce(jd_raw,''), 200) AS jd_preview,
         length(coalesce(jd_raw,'')) AS jd_len
  FROM applications
  WHERE company ILIKE '%playsimple%' OR company ILIKE '%play simple%'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 2));
if (!rows[0]) {
  const fuzzy = await sql`
    SELECT id, company, role FROM applications
    WHERE company ILIKE '%play%' OR role ILIKE '%play%'
    ORDER BY updated_at DESC NULLS LAST LIMIT 20
  `;
  console.log("fuzzy", fuzzy);
}
await sql.end();
