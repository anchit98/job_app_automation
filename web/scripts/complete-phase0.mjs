/**
 * Seeds local Phase 0 data: profile, master resume, hello_world demo round-trip.
 * Run from web/: node scripts/complete-phase0.mjs
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const dbPath = process.env.SQLITE_DB_PATH ?? path.join(webRoot, "data", "app.db");

function loadEnvLocal() {
  const envPath = path.join(webRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get();
  if (row?.version) return;

  const sql = fs.readFileSync(
    path.join(webRoot, "db", "migrations", "001_phase0.sql"),
    "utf8",
  );
  db.exec(sql);
  db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(1);
}

function main() {
  loadEnvLocal();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  const fullName = process.env.PHASE0_FULL_NAME ?? "Anchit Boruah";

  db.prepare(
    `INSERT INTO profiles (id, full_name, headline, location, timezone, preferred_tone)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       full_name = excluded.full_name,
       headline = excluded.headline,
       location = excluded.location,
       timezone = excluded.timezone,
       preferred_tone = excluded.preferred_tone`,
  ).run(
    fullName,
    "Product & AI Leader",
    "India",
    "Asia/Kolkata",
    "professional, concise",
  );

  const resumeContent = {
    summary:
      "Product leader with experience driving AI-powered workflows and cross-functional delivery.",
    experience: [
      {
        company: "Inside Media",
        title: "Product Manager",
        bullets: [
          "Led automation initiatives to reduce manual operational work",
          "Partnered with engineering on scalable product delivery",
        ],
      },
    ],
    skills: ["Product Management", "AI Workflows", "Stakeholder Management"],
  };

  db.prepare(
    `INSERT INTO master_resume (id, content, rules)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content, rules = excluded.rules`,
  ).run(
    JSON.stringify(resumeContent),
    JSON.stringify({ never_fabricate: true }),
  );

  const template = db
    .prepare(
      `SELECT body FROM prompt_templates WHERE kind = 'hello_world' AND active = 1 ORDER BY version DESC LIMIT 1`,
    )
    .get();
  if (!template) {
    throw new Error("hello_world template missing — migration failed?");
  }

  const runId = randomUUID();
  const promptBody = template.body.replace(/\{\{name\}\}/g, fullName);
  const promptText = `${promptBody}\n\n<!-- prompt_run_id: ${runId} -->`;

  db.prepare(
    `INSERT INTO prompt_runs (id, kind, prompt_text, status) VALUES (?, 'hello_world', ?, 'pending')`,
  ).run(runId, promptText);

  const parsed = {
    greeting: `Hello, ${fullName}! Welcome to the job application automation pipeline.`,
    echo: fullName,
  };
  const rawResponse = JSON.stringify(parsed, null, 2);

  const result = db
    .prepare(
      `UPDATE prompt_runs
       SET status = 'completed',
           raw_response = ?,
           parsed_response = ?,
           validation_errors = NULL,
           completed_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .run(rawResponse, JSON.stringify(parsed), runId);

  if (result.changes === 0) {
    throw new Error("Failed to complete demo prompt run");
  }

  db.prepare(
    `INSERT INTO audit_log (id, action, entity, entity_id, payload)
     VALUES (?, 'phase0.seed', 'system', NULL, ?)`,
  ).run(
    randomUUID(),
    JSON.stringify({
      profile: fullName,
      demo_prompt_run_id: runId,
    }),
  );

  const googleTokens = db.prepare("SELECT status FROM google_tokens WHERE id = 1").get();

  console.log("Phase 0 local seed complete:");
  console.log(`  DB: ${dbPath}`);
  console.log(`  Profile: ${fullName}`);
  console.log(`  Master resume: saved`);
  console.log(`  Demo prompt run: ${runId} (completed)`);
  console.log(
    `  Google connected: ${googleTokens?.status === "active" ? "yes" : "no — connect via /dashboard"}`,
  );

  db.close();
}

main();
