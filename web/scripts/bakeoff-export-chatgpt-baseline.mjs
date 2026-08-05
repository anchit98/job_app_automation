import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "bakeoff-out", "chatgpt-baseline");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(root, ".env.testing.local"));

const APPS = [
  { key: "miq", id: "0b94937a-4e41-49cf-971f-c8962c5e38ff" },
  { key: "govpreneurs", id: "7ed22488-b29c-4623-80ee-2127cf168107" },
];
const KINDS = ["jd_parse", "resume", "cover_letter", "cold_email"];

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
fs.mkdirSync(outDir, { recursive: true });

const summary = [];
for (const app of APPS) {
  for (const kind of KINDS) {
    const rows = await sql`
      SELECT id, status, length(coalesce(raw_response,'')) AS rlen,
             left(coalesce(raw_response,''), 200) AS preview,
             exported_at, completed_at
      FROM prompt_runs
      WHERE target_entity_id = ${app.id}
        AND kind = ${kind}
        AND raw_response IS NOT NULL
        AND length(raw_response) > 50
      ORDER BY completed_at DESC NULLS LAST, exported_at DESC NULLS LAST
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      summary.push({ app: app.key, kind, found: false });
      continue;
    }
    const full = await sql`SELECT raw_response FROM prompt_runs WHERE id = ${row.id}`;
    const text = full[0].raw_response;
    const file = path.join(outDir, `${app.key}__${kind}.txt`);
    fs.writeFileSync(file, text, "utf8");
    summary.push({
      app: app.key,
      kind,
      found: true,
      prompt_run_id: row.id,
      status: row.status,
      chars: text.length,
      file: path.relative(root, file).replace(/\\/g, "/"),
    });
    console.log(app.key, kind, "chars=", text.length, "status=", row.status);
  }
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(summary, null, 2));
await sql.end();
console.log("wrote", summary.filter((s) => s.found).length, "baselines");
