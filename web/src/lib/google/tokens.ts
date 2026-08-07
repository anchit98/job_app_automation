import { cache } from "react";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { getCurrentUser } from "@/lib/auth/user";
import { dbGet } from "@/lib/db";
import {
  deleteGoogleTokensRow,
  getGoogleTokensRow,
  markGoogleTokensRevokedRow,
  saveGoogleTokensRow,
} from "@/lib/db/queries";
import {
  createOAuth2Client,
  oauthClientFromTokens,
} from "@/lib/google/oauth";

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account not connected");
    this.name = "GoogleNotConnectedError";
  }
}

export class GoogleTokenRevokedError extends Error {
  constructor() {
    super("Google token revoked - please reconnect");
    this.name = "GoogleTokenRevokedError";
  }
}

export async function saveGoogleTokens(
  accessToken: string,
  refreshToken: string,
  scope: string,
  expiresAt: Date,
  userId?: string,
) {
  await saveGoogleTokensRow({
    encrypted_access_token: encryptSecret(accessToken),
    encrypted_refresh_token: encryptSecret(refreshToken),
    scope,
    expires_at: expiresAt.toISOString(),
    userId,
  });
}

export async function markGoogleTokensRevoked(userId?: string) {
  await markGoogleTokensRevokedRow(userId);
}

export async function disconnectGoogle(userId?: string) {
  await deleteGoogleTokensRow(userId);
}

export async function getGoogleAuthClient(userId?: string) {
  const row = await getGoogleTokensRow(userId);
  if (!row || row.status === "revoked") {
    throw new GoogleNotConnectedError();
  }

  const accessToken = decryptSecret(row.encrypted_access_token);
  const refreshToken = decryptSecret(row.encrypted_refresh_token);
  const client = oauthClientFromTokens(accessToken, refreshToken);

  const expiresAt = new Date(row.expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now < 60_000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      if (credentials.access_token) {
        const newExpiry = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600_000);
        await saveGoogleTokens(
          credentials.access_token,
          credentials.refresh_token ?? refreshToken,
          row.scope,
          newExpiry,
          userId,
        );
        client.setCredentials(credentials);
      }
    } catch {
      await markGoogleTokensRevoked(userId);
      throw new GoogleTokenRevokedError();
    }
  }

  client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    const expiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600_000);
    await saveGoogleTokens(
      tokens.access_token,
      tokens.refresh_token ?? refreshToken,
      row.scope,
      expiry,
      userId,
    );
  });

  return client;
}

// React.cache: layout setup-readiness and pages (e.g. dashboard) both ask this
// in the same request — dedupe to one query.
export const isGoogleConnected = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;

  const lookup = () =>
    dbGet<{ status: string }>(
      `SELECT status FROM google_tokens WHERE user_id = ?`,
      user.id,
    );

  try {
    const row = await lookup();
    return row?.status === "active";
  } catch (first) {
    // One quick retry — a single pool blip must not look like "disconnected"
    // and reopen the Connect Google modal for users who already linked.
    try {
      await new Promise((r) => setTimeout(r, 150));
      const row = await lookup();
      return row?.status === "active";
    } catch (second) {
      console.warn(
        "[google] isGoogleConnected failed after retry:",
        String(second ?? first),
      );
      throw second;
    }
  }
});

/**
 * UI/setup helper: `true` / `false` when known, `null` when the DB check failed.
 * Callers must NOT treat `null` as disconnected (that caused false reconnect prompts).
 */
export async function getGoogleConnectedState(): Promise<boolean | null> {
  try {
    return await isGoogleConnected();
  } catch {
    return null;
  }
}

export async function revokeGoogleTokenAtSource(refreshToken: string) {
  const client = createOAuth2Client();
  await client.revokeToken(refreshToken);
}
