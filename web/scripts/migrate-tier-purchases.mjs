/**
 * Apply 055_tier_purchases.sql.
 *
 * Purely additive: two nullable columns on razorpay_payment_links so the
 * webhook can tell what a link bought. Links created before this carry neither
 * and are read as the legacy ₹299 lifetime offer, which is what they are.
 *
 * Usage: node scripts/migrate-tier-purchases.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const sqlText = fs.readFileSync(
  path.join(__dirname, "../db/migrations/055_tier_purchases.sql"),
  "utf8",
);

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 60,
});

try {
  await sql.unsafe(sqlText);
  console.log("Migration applied.");
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'razorpay_payment_links'
       AND column_name IN ('purchase_kind', 'purchase_code')
     ORDER BY column_name`;
  console.log(`  columns present: ${cols.map((c) => c.column_name).join(", ")}`);
} finally {
  await sql.end();
}
