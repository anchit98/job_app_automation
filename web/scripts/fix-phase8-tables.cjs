const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "app.db");
const db = new Database(dbPath);

console.log("db", dbPath);
console.log("max version", db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get());

const sql = fs.readFileSync(
  path.join(__dirname, "..", "db", "migrations", "040_ensure_phase8_tables.sql"),
  "utf8",
);
db.exec(sql);

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('pipeline_runs','extension_tokens','pending_extension_runs')",
  )
  .all();
console.log("phase8 tables", tables);

const applied = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
if ((applied?.v ?? 0) < 40) {
  db.prepare("INSERT INTO schema_migrations (version) VALUES (40)").run();
  console.log("recorded migration version 40");
} else {
  console.log("schema already at", applied.v);
}

db.close();
