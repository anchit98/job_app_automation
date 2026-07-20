import { createHash, randomBytes } from "crypto";
import { getDb, SINGLETON_ID } from "@/lib/db";

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

export function getActiveExtensionTokenRow(): {
  token_hash: string;
  token_prefix: string;
  created_at: string;
  revoked_at: string | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT token_hash, token_prefix, created_at, revoked_at
       FROM extension_tokens WHERE id = ?`,
    )
    .get(SINGLETON_ID) as
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

export function upsertExtensionToken(input: {
  token_hash: string;
  token_prefix: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO extension_tokens (id, token_hash, token_prefix, created_at, revoked_at)
       VALUES (?, ?, ?, datetime('now'), NULL)
       ON CONFLICT(id) DO UPDATE SET
         token_hash = excluded.token_hash,
         token_prefix = excluded.token_prefix,
         created_at = datetime('now'),
         revoked_at = NULL`,
    )
    .run(SINGLETON_ID, input.token_hash, input.token_prefix);
}

export function revokeExtensionToken(): void {
  getDb()
    .prepare(
      `UPDATE extension_tokens SET revoked_at = datetime('now') WHERE id = ?`,
    )
    .run(SINGLETON_ID);
}

export function verifyExtensionBearer(
  authorizationHeader: string | null,
): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return false;
  const row = getActiveExtensionTokenRow();
  if (!row) return false;
  return hashExtensionToken(token) === row.token_hash;
}
