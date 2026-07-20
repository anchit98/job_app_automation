import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const webRoot = path.join(__dirname, "..");
const masterPath = path.join(repoRoot, "masterresume", "anchit-master-resume.json");
const dbPath = process.env.SQLITE_DB_PATH ?? path.join(webRoot, "data", "app.db");

const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));

const db = new Database(dbPath);

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
  "Anchit Boruah",
  master.headline,
  "Bengaluru, India",
  "Asia/Kolkata",
  "professional, concise",
);

db.prepare(
  `INSERT INTO master_resume (id, content, rules)
   VALUES (1, ?, ?)
   ON CONFLICT(id) DO UPDATE SET content = excluded.content, rules = excluded.rules`,
).run(
  JSON.stringify(master),
  JSON.stringify({
    never_fabricate: true,
    layout: "anchit_v1",
    preserve_sections: true,
    source_pdf: "masterresume/Anchit.Boruah_Resume.pdf",
  }),
);

console.log("Seeded Anchit master resume from", masterPath);
console.log(
  JSON.stringify(
    {
      experience_roles: master.experience.length,
      projects: master.projects.length,
      skills_lines: master.skills.length,
      education: master.education.length,
    },
    null,
    2,
  ),
);

db.close();
