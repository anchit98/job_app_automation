const Database = require("better-sqlite3");
const fs = require("fs");
const db = new Database("data/app.db");

const tables = db
  .prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'applications_fts%' ORDER BY name",
  )
  .all();
fs.writeFileSync("scripts/_tables.json", JSON.stringify(tables, null, 2));

const templates = db.prepare("SELECT * FROM prompt_templates ORDER BY kind, version").all();
fs.writeFileSync("scripts/_prompt_templates.json", JSON.stringify(templates, null, 2));

console.log("tables:", tables.map((t) => t.name).join(", "));
console.log("templates:", templates.length);
