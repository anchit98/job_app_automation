/**
 * Print a mobile review URL for the latest pending payment claim.
 * Usage: npx tsx scripts/print-payment-review-url.ts
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { paymentReviewUrl } from "../src/lib/billing/payment-review-token";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const [claim] = await sql`
      SELECT id, upi_reference, status FROM payment_claims
      WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1
    `;
    if (!claim) {
      console.error("No pending claim.");
      process.exitCode = 1;
      return;
    }
    console.log(await paymentReviewUrl(claim.id));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
