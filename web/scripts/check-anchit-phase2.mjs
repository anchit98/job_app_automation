import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "data", "app.db"));

const migrations = db
  .prepare("SELECT version FROM schema_migrations ORDER BY version")
  .all();
const templates = db
  .prepare("SELECT id, version, active FROM prompt_templates WHERE kind = 'resume'")
  .all();
const master = db.prepare("SELECT json_extract(content, '$.headline') AS headline FROM master_resume WHERE id = 1").get();
const profile = db.prepare("SELECT full_name, location FROM profiles WHERE id = 1").get();

console.log(JSON.stringify({ migrations, templates, master, profile }, null, 2));
db.close();
