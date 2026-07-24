import { createHash, randomBytes } from "crypto";
import { dbGet, dbRun } from "@/lib/db";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";

async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromAls = getRequestUserId();
  if (fromAls) return fromAls;
  return (await requireUser()).id;
}

export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateExtensionToken(): {
  token: string;
  token_hash: string;
  token_prefix: string;
} {
  const token = `jab_${randomBytes(24).toString("base64url")}`;
  return {
    token,
    token_hash: hashExtensionToken(token),
    token_prefix: token.slice(0, 12),
  };
}

export async function getActiveExtensionTokenRow(userId?: string): Promise<{
  user_id: string;
  token_hash: string;
  token_prefix: string;
  created_at: string;
  revoked_at: string | null;
} | null> {
  const uid = await currentUserId(userId);
  const row = (await dbGet(
    `SELECT user_id, token_hash, token_prefix, created_at, revoked_at
       FROM extension_tokens WHERE user_id = ?`,
    uid,
  )) as
    | {
        user_id: string;
        token_hash: string;
        token_prefix: string;
        created_at: string;
        revoked_at: string | null;
      }
    | undefined;
  if (!row || row.revoked_at) return null;
  return row;
}

export async function upsertExtensionToken(input: {
  token_hash: string;
  token_prefix: string;
  userId?: string;
}): Promise<void> {
  const uid = await currentUserId(input.userId);
  await dbRun(
    `INSERT INTO extension_tokens (user_id, token_hash, token_prefix, created_at, revoked_at)
       VALUES (?, ?, ?, (NOW() AT TIME ZONE 'utc')::text, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         token_prefix = excluded.token_prefix,
         created_at = (NOW() AT TIME ZONE 'utc')::text,
         revoked_at = NULL`,
    uid,
    input.token_hash,
    input.token_prefix,
  );
}

export async function revokeExtensionToken(userId?: string): Promise<void> {
  const uid = await currentUserId(userId);
  await dbRun(
    `UPDATE extension_tokens SET revoked_at = (NOW() AT TIME ZONE 'utc')::text WHERE user_id = ?`,
    uid,
  );
}

/** Resolve bearer → owning user. Returns null if invalid/revoked. */
export async function verifyExtensionBearer(
  authorizationHeader: string | null,
): Promise<{ userId: string } | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const tokenHash = hashExtensionToken(token);
  const row = (await dbGet(
    `SELECT user_id, revoked_at FROM extension_tokens WHERE token_hash = ?`,
    tokenHash,
  )) as { user_id: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return null;
  return { userId: row.user_id };
}
