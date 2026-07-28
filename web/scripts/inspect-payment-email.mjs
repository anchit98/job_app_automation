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

const admins = await sql`
  SELECT u.id, u.email, u.is_admin, u.full_name,
         gt.status AS gstatus, gt.scope, gt.updated_at
    FROM users u
    LEFT JOIN google_tokens gt ON gt.user_id = u.id
   WHERE u.is_admin = true
      OR lower(u.email) = lower('anchitboruah@gmail.com')
   ORDER BY u.created_at
`;
console.log("USERS", JSON.stringify(admins, null, 2));

const claims = await sql`
  SELECT c.id, c.upi_reference, c.status, c.created_at, u.email
    FROM payment_claims c
    JOIN users u ON u.id = c.user_id
   ORDER BY c.created_at DESC
   LIMIT 5
`;
console.log("CLAIMS", JSON.stringify(claims, null, 2));

const audits = await sql`
  SELECT action, entity_id, payload, created_at
    FROM audit_log
   WHERE action LIKE 'payment.claim%'
   ORDER BY created_at DESC
   LIMIT 10
`;
console.log("AUDITS", JSON.stringify(audits, null, 2));
console.log("ADMIN_NOTIFY_EMAIL=", process.env.ADMIN_NOTIFY_EMAIL);

await sql.end();
