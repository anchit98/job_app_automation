const Database = require("better-sqlite3");
const db = new Database("data/app.db");
const app = db.prepare("SELECT id FROM applications ORDER BY created_at DESC LIMIT 1").get();
if (!app) {
  console.log("no apps");
  process.exit(0);
}
const id = "test-pipeline-" + Date.now();
db.prepare(
  "INSERT INTO pipeline_runs (id, application_id, status, current_stage, stages_json, contacts_json) VALUES (?,?,?,?,?,?)",
).run(id, app.id, "running", "resume", "[]", "[]");
console.log("insert ok", id);
db.prepare("DELETE FROM pipeline_runs WHERE id = ?").run(id);
console.log("cleanup ok");
db.close();
