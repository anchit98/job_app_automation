/**
 * One-shot: revoke every user's Google grant, delete google_tokens, wipe sessions.
 * After this, everyone must sign in again and reconnect Google (new scopes).
 *
 *   node scripts/force-reconsent-all.mjs          # dry-run
 *   node scripts/force-reconsent-all.mjs --confirm
 *
 * Uses web/.env.local (or env vars already set). Point DATABASE_URL at production
 * when forcing reconsent for live users.
 */
import { createDecipheriv, scryptSync } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const confirm = process.argv.includes("--confirm");
const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}
if (!encryptionKey) {
  console.error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  process.exit(1);
}

function decryptSecret(ciphertext) {
  const key = scryptSync(encryptionKey, "job-app-salt", 32);
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

async function revokeAtGoogle(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${encodeURIComponent(refreshToken)}`,
  });
  // 200 = revoked; 400 often means already revoked — both fine for reconsent.
  if (!res.ok && res.status !== 400) {
    const text = await res.text().catch(() => "");
    throw new Error(`revoke HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  const tokens = await sql`
    SELECT user_id, encrypted_refresh_token, status, scope
      FROM google_tokens
  `;
  const sessionCount = await sql`SELECT COUNT(*)::int AS c FROM sessions`;
  const host = (() => {
    try {
      return new URL(databaseUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
    } catch {
      return "(unknown host)";
    }
  })();

  console.log(`Database host: ${host}`);
  console.log(`Google token rows: ${tokens.length}`);
  console.log(`Active sessions: ${sessionCount[0]?.c ?? "?"}`);
  if (!confirm) {
    console.log("\nDry-run only. Re-run with --confirm to apply.");
    process.exit(0);
  }

  let revoked = 0;
  let revokeFailed = 0;
  for (const row of tokens) {
    if (!row.encrypted_refresh_token) continue;
    try {
      const refresh = decryptSecret(row.encrypted_refresh_token);
      await revokeAtGoogle(refresh);
      revoked += 1;
      console.log(`  revoked Google grant for user ${row.user_id}`);
    } catch (err) {
      revokeFailed += 1;
      console.warn(
        `  revoke failed for ${row.user_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const deletedTokens = await sql`DELETE FROM google_tokens RETURNING user_id`;
  const deletedSessions = await sql`DELETE FROM sessions RETURNING id`;

  await sql`
    INSERT INTO audit_log (id, action, entity, entity_id, payload, created_at)
    VALUES (
      gen_random_uuid()::text,
      'admin.force_reconsent_all',
      'system',
      'all',
      ${JSON.stringify({
        google_tokens_deleted: deletedTokens.length,
        sessions_deleted: deletedSessions.length,
        google_revokes_ok: revoked,
        google_revokes_failed: revokeFailed,
      })},
      ((NOW() AT TIME ZONE 'utc')::text)
    )
  `.catch((err) => {
    console.warn("audit_log insert skipped:", err?.message ?? err);
  });

  console.log("\nDone.");
  console.log(`  Google tokens deleted: ${deletedTokens.length}`);
  console.log(`  Sessions deleted: ${deletedSessions.length}`);
  console.log(`  Google revokes ok/failed: ${revoked}/${revokeFailed}`);
  console.log(
    "Users must sign in again and reconnect Google to see the new scopes.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
