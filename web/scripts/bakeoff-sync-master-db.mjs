import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(__dirname, "../.env.local"));

const USER_ID = "ca7513be-4b5c-43a7-81f0-e98052689b6e";
const master = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../masterresume/anchit-master-resume.json"),
    "utf8",
  ),
);
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
await sql`
  UPDATE master_resume
  SET content = ${sql.json(master)}
  WHERE user_id = ${USER_ID}
`;
await sql.end();
console.log("Synced master resume content to DB");
console.log("skills:", master.skills);
