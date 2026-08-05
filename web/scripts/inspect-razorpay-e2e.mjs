/**
 * Inspect Razorpay payment-link E2E state for a user email.
 * Run: node scripts/inspect-razorpay-e2e.mjs <email>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/inspect-razorpay-e2e.mjs <email>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const users = await sql`
  SELECT id, email, is_paid, paid_at
  FROM users WHERE lower(email) = lower(${email})
`;
if (!users.length) {
  console.log(JSON.stringify({ error: "user not found", email }, null, 2));
  await sql.end();
  process.exit(1);
}
const user = users[0];
const links = await sql`
  SELECT id, razorpay_payment_link_id, reference_id, status, amount_paise,
         razorpay_payment_id, created_at, paid_at, short_url
  FROM razorpay_payment_links
  WHERE user_id = ${user.id}
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log(
  JSON.stringify(
    {
      user: {
        id: user.id,
        email: user.email,
        is_paid: Boolean(user.is_paid),
        paid_at: user.paid_at,
      },
      recent_links: links,
    },
    null,
    2,
  ),
);
await sql.end();
