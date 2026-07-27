import { createHash, randomBytes, randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { env } from "@/lib/env";

export type PasswordResetKind = "forgot_password" | "admin_reset";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(
  userId: string,
  kind: PasswordResetKind,
  issuedByAdminId?: string | null,
) {
  const token = `apr_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashResetToken(token);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();

  await dbRun(
    `UPDATE password_reset_tokens
        SET used_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE user_id = ?
        AND used_at IS NULL`,
    userId,
  );
  await resolvePasswordResetRequestsForUser(userId);

  await dbRun(
    `INSERT INTO password_reset_tokens (
       id, user_id, token_hash, kind, issued_by_admin_id, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    tokenHash,
    kind,
    issuedByAdminId ?? null,
    expiresAt,
  );

  const appUrl = env.appUrl().replace(/\/$/, "");
  return {
    id,
    token,
    resetUrl: `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
    expires_at: expiresAt,
  };
}

export async function consumePasswordResetToken(token: string): Promise<{
  id: string;
  user_id: string;
  email: string;
  expires_at: string;
} | null> {
  const tokenHash = hashResetToken(token.trim());
  if (!tokenHash) return null;
  const row = (await dbGet(
    `SELECT prt.id, prt.user_id, prt.expires_at, u.email
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ?
        AND prt.used_at IS NULL`,
    tokenHash,
  )) as
    | {
        id: string;
        user_id: string;
        email: string;
        expires_at: string;
      }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await dbRun(
      `UPDATE password_reset_tokens
          SET used_at = ((NOW() AT TIME ZONE 'utc')::text)
        WHERE id = ?`,
      row.id,
    );
    return null;
  }
  await dbRun(
    `UPDATE password_reset_tokens
        SET used_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ?`,
    row.id,
  );
  return row;
}

export async function peekPasswordResetToken(token: string): Promise<boolean> {
  const tokenHash = hashResetToken(token.trim());
  if (!tokenHash) return false;
  const row = (await dbGet(
    `SELECT expires_at
       FROM password_reset_tokens
      WHERE token_hash = ?
        AND used_at IS NULL`,
    tokenHash,
  )) as { expires_at: string } | undefined;
  if (!row) return false;
  return new Date(row.expires_at).getTime() >= Date.now();
}

export async function markAllPasswordResetTokensUsed(userId: string) {
  await dbRun(
    `UPDATE password_reset_tokens
        SET used_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE user_id = ?
        AND used_at IS NULL`,
    userId,
  );
}

export async function listActivePasswordResetTokens() {
  return (await dbAll(
    `SELECT prt.id, prt.user_id, prt.kind, prt.expires_at, prt.created_at,
            u.email, u.full_name
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
      WHERE prt.used_at IS NULL
        AND prt.expires_at >= ((NOW() AT TIME ZONE 'utc')::text)
      ORDER BY prt.created_at DESC`,
  )) as Array<{
    id: string;
    user_id: string;
    kind: PasswordResetKind;
    expires_at: string;
    created_at: string;
    email: string;
    full_name: string | null;
  }>;
}

export async function createPasswordResetRequest(userId: string) {
  await dbRun(
    `INSERT INTO password_reset_requests (id, user_id)
     VALUES (?, ?)`,
    randomUUID(),
    userId,
  );
}

export async function resolvePasswordResetRequestsForUser(userId: string) {
  await dbRun(
    `UPDATE password_reset_requests
        SET resolved_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE user_id = ?
        AND resolved_at IS NULL`,
    userId,
  );
}

export async function listOpenPasswordResetRequests() {
  return (await dbAll(
    `SELECT prr.id, prr.user_id, prr.created_at, u.email, u.full_name
       FROM password_reset_requests prr
       INNER JOIN users u ON u.id = prr.user_id
      WHERE prr.resolved_at IS NULL
      ORDER BY prr.created_at DESC`,
  )) as Array<{
    id: string;
    user_id: string;
    created_at: string;
    email: string;
    full_name: string | null;
  }>;
}
