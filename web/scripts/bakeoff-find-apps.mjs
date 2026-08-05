import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const webEnv = path.join(__dirname, "../.env.local");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv(webEnv);
loadEnv(path.join(root, ".env.testing.local"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const apps = await sql`
  SELECT id, company, role, status, created_at
  FROM applications
  WHERE company ILIKE ${"%miq%"}
     OR company ILIKE ${"%gov%"}
     OR company ILIKE ${"%preun%"}
     OR role ILIKE ${"%gov%"}
     OR role ILIKE ${"%preun%"}
  ORDER BY created_at DESC
  LIMIT 30
`;

console.log("MATCHED_APPS");
console.log(JSON.stringify(apps, null, 2));

for (const app of apps) {
  const prompts = await sql`
    SELECT pr.id, pr.kind, pr.status, length(pr.prompt_text) AS prompt_len,
           left(pr.prompt_text, 120) AS prompt_preview,
           pr.created_at
    FROM prompt_runs pr
    WHERE pr.application_id = ${app.id}
       OR pr.target_entity_id = ${app.id}
    ORDER BY pr.created_at DESC
    LIMIT 20
  `;
  console.log(`\nPROMPTS for ${app.company} (${app.id}) count=${prompts.length}`);
  console.log(JSON.stringify(prompts, null, 2));
}

await sql.end();
