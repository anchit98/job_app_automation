/**
 * Razorpay orders table for Checkout + webhook unlock.
 * Run: node scripts/migrate-razorpay-orders.mjs
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

if (!(await tableExists("razorpay_orders"))) {
  await sql`
    CREATE TABLE razorpay_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      razorpay_order_id TEXT NOT NULL UNIQUE,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'paid', 'failed')),
      razorpay_payment_id TEXT,
      receipt TEXT,
      created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
      paid_at TEXT
    )
  `;
  console.log("Created razorpay_orders");
} else {
  console.log("razorpay_orders already exists");
}

await sql`
  CREATE INDEX IF NOT EXISTS razorpay_orders_user_idx
    ON razorpay_orders (user_id, created_at DESC)
`;
await sql`
  CREATE INDEX IF NOT EXISTS razorpay_orders_status_idx
    ON razorpay_orders (status, created_at DESC)
`;
console.log("Indexes ensured");

await sql.end();
