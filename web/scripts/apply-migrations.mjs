import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_DB_PATH ?? path.join(__dirname, "..", "data", "app.db");
const migrationsDir = path.join(__dirname, "..", "db", "migrations");

const db = new Database(dbPath);
db.exec(
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
);
const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
const applied = row?.v ?? 0;

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (let i = 0; i < files.length; i++) {
  const version = i + 1;
  if (version <= applied) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, files[i]), "utf8");
  console.log(`Applying migration ${version}: ${files[i]}`);
  db.exec(sql);
  db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
}

console.log("Migrations up to date:", db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get());
db.close();
