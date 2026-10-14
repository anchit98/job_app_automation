/**
 * Create (or reset) a throwaway account for walking the full signup flow.
 *
 * The account starts completely empty — no Google, no profile, no resume — so
 * it lands on onboarding exactly like a real new user and can be used to test
 * "I have a CV" vs "build one in the builder".
 *
 * Usage:
 *   node scripts/create-test-user.mjs
 *   node scripts/create-test-user.mjs someone@example.com MyPassword123
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs
  .readFileSync(path.join(__dirname, "../.env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const email = (process.argv[2] || "testuser@jobappos.local").toLowerCase();
const password = process.argv[3] || "TestUser@12345";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 60,
});

try {
  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email}`;

  // Wipe the test account's data rather than the row, so repeated runs give a
  // clean first-run experience without orphaning anything.
  if (existing.length > 0) {
    const id = existing[0].id;
    for (const table of [
      "builder_cv_versions",
      "builder_profiles",
      "user_entitlements",
      "master_resume",
      "master_cover_letter",
      "google_tokens",
      "profiles",
      "sessions",
    ]) {
      await sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [id]).catch(() => {});
    }
    await sql`
      UPDATE users
         SET password_hash = ${await bcrypt.hash(password, 10)},
             full_name = 'Test User',
             is_paid = false,
             is_admin = false,
             must_reset_password = false
       WHERE id = ${id}`;
    console.log(`Reset existing test user (${id})`);
  } else {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO users (id, email, password_hash, full_name, is_admin, must_reset_password, is_paid)
      VALUES (${id}, ${email}, ${await bcrypt.hash(password, 10)}, 'Test User', false, false, false)`;
    console.log(`Created test user (${id})`);
  }

  // Free plan: metering is disabled app-wide right now, but the row keeps the
  // account off the legacy_lifetime path once billing is switched on.
  const [{ id }] = await sql`SELECT id FROM users WHERE lower(email) = ${email}`;
  await sql`
    INSERT INTO user_entitlements (user_id, plan)
    VALUES (${id}, 'free')
    ON CONFLICT (user_id) DO UPDATE SET plan = 'free'`;

  console.log("");
  console.log("  email:    ", email);
  console.log("  password: ", password);
  console.log("  state:     no Google, no profile, no resume — starts at /onboarding");
} finally {
  await sql.end();
}
