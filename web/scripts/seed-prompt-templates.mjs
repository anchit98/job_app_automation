/**
 * Seed prompt_templates into Supabase Postgres from the exported local dump.
 *
 * Usage:
 *   cd web
 *   # DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-....pooler.supabase.com:6543/postgres
 *   node scripts/seed-prompt-templates.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to your Supabase Postgres connection string.");
  process.exit(1);
}

const templatesPath = path.join(__dirname, "_prompt_templates.json");
if (!fs.existsSync(templatesPath)) {
  console.error("Missing scripts/_prompt_templates.json — run scripts/export-for-pg.cjs first (needs local app.db).");
  process.exit(1);
}

const templates = JSON.parse(fs.readFileSync(templatesPath, "utf8"));
const sql = postgres(url, { prepare: false, max: 1 });

try {
  for (const t of templates) {
    await sql`
      INSERT INTO prompt_templates (
        id, kind, version, body, variables, output_schema, active, notes, created_at
      ) VALUES (
        ${t.id},
        ${t.kind},
        ${t.version},
        ${t.body},
        ${t.variables},
        ${t.output_schema},
        ${t.active},
        ${t.notes},
        ${t.created_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind,
        version = EXCLUDED.version,
        body = EXCLUDED.body,
        variables = EXCLUDED.variables,
        output_schema = EXCLUDED.output_schema,
        active = EXCLUDED.active,
        notes = EXCLUDED.notes
    `;
  }
  console.log(`Seeded ${templates.length} prompt_templates.`);
} finally {
  await sql.end({ timeout: 5 });
}
