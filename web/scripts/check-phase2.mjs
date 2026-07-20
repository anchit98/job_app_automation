import Database from "better-sqlite3";

const db = new Database("data/app.db");
const migrations = db
  .prepare("SELECT version FROM schema_migrations ORDER BY version")
  .all();
const resumeTable = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='resume_versions'",
  )
  .get();
const template = db
  .prepare(
    "SELECT kind FROM prompt_templates WHERE kind = 'resume' AND active = 1",
  )
  .get();

console.log(
  JSON.stringify(
    {
      migrations,
      resume_versions_table: Boolean(resumeTable),
      resume_template: Boolean(template),
    },
    null,
    2,
  ),
);
db.close();
