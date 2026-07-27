import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
await sql`
  UPDATE pipeline_runs
  SET status = 'queued',
      updated_at = (NOW() AT TIME ZONE 'utc')::text
  WHERE id = 'e8b409b4-a240-4c66-b3eb-7cb9afdcf740'
`;
console.log("RockED queued behind Zynga");
await sql.end();
