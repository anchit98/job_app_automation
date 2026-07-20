import Database from "better-sqlite3";

const db = new Database("data/app.db");
const migrations = db
  .prepare("SELECT version FROM schema_migrations ORDER BY version")
  .all();
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
  )
  .get();
const template = db
  .prepare(
    "SELECT kind FROM prompt_templates WHERE kind = 'jd_parse' AND active = 1",
  )
  .get();

console.log(
  JSON.stringify(
    {
      migrations,
      applications_table: Boolean(tables),
      jd_parse_template: Boolean(template),
    },
    null,
    2,
  ),
);
db.close();
