import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(root, ".env.testing.local"));

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const apps = [
  { key: "miq", id: "0b94937a-4e41-49cf-971f-c8962c5e38ff" },
  { key: "govpreneurs", id: "7ed22488-b29c-4623-80ee-2127cf168107" },
];

for (const app of apps) {
  const rows = await sql`
    SELECT company, role FROM applications WHERE id = ${app.id}
  `;
  console.log("\n===", app.key, rows[0], "===");
  const rv = await sql`
    SELECT id, version, status, drive_doc_id, drive_pdf_id, left(content::text, 80) AS content_preview, created_at
    FROM resume_versions WHERE application_id = ${app.id}
    ORDER BY version DESC LIMIT 5
  `;
  console.log("resume_versions:", JSON.stringify(rv, null, 2));
  const cv = await sql`
    SELECT id, version, status, drive_doc_id, drive_pdf_id, drive_docx_id, created_at
    FROM cover_letter_versions WHERE application_id = ${app.id}
    ORDER BY version DESC LIMIT 5
  `;
  console.log("cover_letter_versions:", JSON.stringify(cv, null, 2));
}

await sql.end();
