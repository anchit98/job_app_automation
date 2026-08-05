import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "bakeoff-out");

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

const manifest = [];

for (const app of APPS) {
  const rows = await sql`
    SELECT id, company, role, status,
           length(coalesce(jd_raw, '')) AS jd_len
    FROM applications WHERE id = ${app.id}
  `;
  console.log(app.key, rows[0]);

  const runs = await sql`
    SELECT id, stages_json, created_at
    FROM pipeline_runs
    WHERE application_id = ${app.id}
    ORDER BY created_at::timestamptz DESC
    LIMIT 3
  `;

  const byKind = {};
  for (const run of runs) {
    let stages = [];
    try {
      stages = JSON.parse(run.stages_json || "[]");
    } catch {
      stages = [];
    }
    for (const stage of stages) {
      const kind = stage.id;
      if (!KINDS.includes(kind) || !stage.prompt_run_id || byKind[kind]) continue;
      const pr = await sql`
        SELECT id AS prompt_run_id, prompt_text, status, length(prompt_text) AS plen
        FROM prompt_runs WHERE id = ${stage.prompt_run_id}
      `;
      if (pr[0]?.prompt_text) {
        byKind[kind] = { ...pr[0], kind };
      }
    }
  }

  for (const kind of KINDS) {
    if (byKind[kind]) continue;
    const fallback = await sql`
      SELECT id AS prompt_run_id, prompt_text, status, length(prompt_text) AS plen
      FROM prompt_runs
      WHERE target_entity_id = ${app.id}
        AND kind = ${kind}
        AND prompt_text IS NOT NULL
        AND length(prompt_text) > 50
      ORDER BY exported_at DESC NULLS LAST
      LIMIT 1
    `;
    if (fallback[0]) byKind[kind] = { ...fallback[0], kind };
  }

  // Last resort: any prompt of that kind for same user? skip - stick to app-scoped

  const appDir = path.join(outDir, "prompts", app.key);
  fs.mkdirSync(appDir, { recursive: true });

  for (const kind of KINDS) {
    const row = byKind[kind];
    if (!row?.prompt_text) {
      console.log(`MISSING ${app.key}/${kind}`);
      continue;
    }
    const file = path.join(appDir, `${kind}.txt`);
    fs.writeFileSync(file, row.prompt_text, "utf8");
    manifest.push({
      app: app.key,
      application_id: app.id,
      company: rows[0]?.company,
      role: rows[0]?.role,
      kind,
      prompt_run_id: row.prompt_run_id,
      prompt_chars: row.prompt_text.length,
      file: path.relative(root, file).replace(/\\/g, "/"),
    });
    console.log(`WROTE ${app.key}/${kind} chars=${row.prompt_text.length}`);
  }
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("MANIFEST", manifest.length, "prompts");
await sql.end();
