/**
 * Razorpay payment links table for hosted Payment Link + webhook unlock.
 * Run: node scripts/migrate-razorpay-payment-links.mjs
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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing in web/.env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function tableExists(table) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

if (!(await tableExists("razorpay_payment_links"))) {
  await sql`
    CREATE TABLE razorpay_payment_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      razorpay_payment_link_id TEXT NOT NULL UNIQUE,
      short_url TEXT,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'paid', 'expired', 'cancelled')),
      razorpay_payment_id TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
      paid_at TEXT
    )
  `;
  console.log("Created razorpay_payment_links");
} else {
  console.log("razorpay_payment_links already exists");
}

await sql`
  CREATE INDEX IF NOT EXISTS razorpay_payment_links_user_idx
    ON razorpay_payment_links (user_id, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS razorpay_payment_links_status_idx
    ON razorpay_payment_links (status, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS razorpay_payment_links_reference_idx
    ON razorpay_payment_links (reference_id)
`;
console.log("Indexes ensured");

await sql.end();
