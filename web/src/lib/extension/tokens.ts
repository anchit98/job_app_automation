import { createHash, randomBytes } from "crypto";
import { dbGet, dbRun, SINGLETON_ID } from "@/lib/db";

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

export async function getActiveExtensionTokenRow(): Promise<{
  token_hash: string;
  token_prefix: string;
  created_at: string;
  revoked_at: string | null;
} | null> {
  const row = (await dbGet(
    `SELECT token_hash, token_prefix, created_at, revoked_at
       FROM extension_tokens WHERE id = ?`,
    SINGLETON_ID,
  )) as
    | {
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
}): Promise<void> {
  await dbRun(
    `INSERT INTO extension_tokens (id, token_hash, token_prefix, created_at, revoked_at)
       VALUES (?, ?, ?, (NOW() AT TIME ZONE 'utc')::text, NULL)
       ON CONFLICT (id) DO UPDATE SET
         token_hash = excluded.token_hash,
         token_prefix = excluded.token_prefix,
         created_at = (NOW() AT TIME ZONE 'utc')::text,
         revoked_at = NULL`,
    SINGLETON_ID,
    input.token_hash,
    input.token_prefix,
  );
}

export async function revokeExtensionToken(): Promise<void> {
  await dbRun(
    `UPDATE extension_tokens SET revoked_at = (NOW() AT TIME ZONE 'utc')::text WHERE id = ?`,
    SINGLETON_ID,
  );
}

export async function verifyExtensionBearer(
  authorizationHeader: string | null,
): Promise<boolean> {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return false;
  const row = await getActiveExtensionTokenRow();
  if (!row) return false;
  return hashExtensionToken(token) === row.token_hash;
}
