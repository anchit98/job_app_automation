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

const apps = await sql`
  SELECT id, company, role, status, created_at, updated_at
  FROM applications
  WHERE company ILIKE ${"%zamp%"}
     OR company ILIKE ${"%morgan%"}
     OR company ILIKE ${"%jpmorgan%"}
     OR company ILIKE ${"%jp morgan%"}
  ORDER BY created_at DESC
`;

console.log("APPS", apps);

for (const a of apps) {
  const cls = await sql`
    SELECT id, version, status, prompt_run_id, drive_doc_id, drive_pdf_id,
           created_at
    FROM cover_letter_versions
    WHERE application_id = ${a.id}
    ORDER BY version
  `;
  const resumes = await sql`
    SELECT id, version, status, prompt_run_id, created_at
    FROM resume_versions
    WHERE application_id = ${a.id}
    ORDER BY version
  `;
  const prompts = await sql`
    SELECT id, kind, status, exported_at, completed_at
    FROM prompt_runs
    WHERE target_entity_id = ${a.id}
      AND kind IN ('cover_letter', 'resume')
    ORDER BY exported_at
  `;
  const pipes = await sql`
    SELECT id, status, current_stage, stages_json, created_at, updated_at
    FROM pipeline_runs
    WHERE application_id = ${a.id}
    ORDER BY created_at DESC
  `;
  const audits = await sql`
    SELECT action, entity_id, payload, created_at
    FROM audit_log
    WHERE (entity = 'cover_letter_versions' OR action LIKE 'cover_letter%' OR action LIKE 'prompt%')
      AND (
        entity_id = ${a.id}
        OR payload ILIKE ${"%" + a.id + "%"}
        OR entity_id = ANY(${cls.map((c) => c.id)})
      )
    ORDER BY created_at DESC
    LIMIT 30
  `;

  console.log("\n====", a.company, "|", a.role, "|", a.id);
  console.log("cover_letters:", JSON.stringify(cls, null, 2));
  console.log("resumes:", JSON.stringify(resumes, null, 2));
  console.log("prompts:", JSON.stringify(prompts, null, 2));
  for (const p of pipes) {
    let stages;
    try {
      stages = JSON.parse(p.stages_json);
    } catch {
      stages = p.stages_json;
    }
    const clStage = Array.isArray(stages)
      ? stages.find((s) => s.id === "cover_letter")
      : null;
    console.log("pipeline", {
      id: p.id,
      status: p.status,
      current: p.current_stage,
      created: p.created_at,
      updated: p.updated_at,
      cover_letter_stage: clStage,
    });
  }
  console.log("audits:", JSON.stringify(audits, null, 2));
}

// Also: any apps with >1 cover letter version recently
const dups = await sql`
  SELECT a.company, a.role, a.id, COUNT(c.*) AS n, array_agg(c.version ORDER BY c.version) AS versions,
         array_agg(c.status ORDER BY c.version) AS statuses,
         array_agg(c.prompt_run_id ORDER BY c.version) AS prompt_runs
  FROM applications a
  JOIN cover_letter_versions c ON c.application_id = a.id
  GROUP BY a.id, a.company, a.role
  HAVING COUNT(c.*) > 1
  ORDER BY MAX(c.created_at) DESC
  LIMIT 15
`;
console.log("\nAPPS WITH MULTIPLE COVER LETTERS:", JSON.stringify(dups, null, 2));

await sql.end({ timeout: 5 });
