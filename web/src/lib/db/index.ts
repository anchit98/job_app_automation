import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export const SINGLETON_ID = 1;

function getDbPath(): string {
  return process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "data", "app.db");
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = database
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version: number | null };

  const applied = row.version ?? 0;
  const migrationFiles = [
    "001_phase0.sql",
    "002_phase1.sql",
    "003_phase2.sql",
    "004_anchit_resume_layout.sql",
    "005_gdoc_resume.sql",
    "006_sentence_count.sql",
    "007_bullet_shape.sql",
    "008_anchit_bullet_layout.sql",
    "009_bullet_char_range.sql",
    "010_locked_layout_jd_keywords.sql",
    "011_stronger_prompt.sql",
    "012_word_count_prompt.sql",
    "013_tighter_range.sql",
    "014_loose_range.sql",
    "015_tight_lines.sql",
    "016_width_based_prompt.sql",
    "017_phase3_cover_letter.sql",
    "018_fix_cover_letter_template.sql",
    "019_cover_letter_gdoc_template.sql",
    "020_phase4_contacts.sql",
    "021_phase5_cold_email.sql",
    "022_cold_email_no_signature.sql",
    "023_profile_email_signature.sql",
    "024_cover_letter_greeting_metrics.sql",
    "025_phase6_tracker.sql",
    "026_phase7_follow_ups.sql",
    "027_fix_fts_triggers.sql",
    "028_resume_prompt_v15.sql",
    "029_resume_prompt_v16.sql",
    "030_resume_prompt_v17.sql",
    "031_resume_prompt_v18.sql",
    "032_resume_prompt_v19.sql",
    "033_resume_prompt_v20.sql",
    "034_resume_prompt_v21.sql",
    "035_resume_prompt_v22.sql",
    "036_resume_prompt_v23.sql",
    "037_resume_prompt_v24.sql",
    "038_resume_prompt_v25.sql",
    "039_phase8_extension_pipeline.sql",
    "040_ensure_phase8_tables.sql",
    "041_extension_wake_gate.sql",
    "042_resume_prompt_v26.sql",
    "043_email_instructions.sql",
  ];

  for (let i = 0; i < migrationFiles.length; i++) {
    const version = i + 1;
    if (version <= applied) continue;

    const migrationPath = path.join(
      process.cwd(),
      "db",
      "migrations",
      migrationFiles[i],
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    database.exec(sql);
    database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  }
  return db;
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
