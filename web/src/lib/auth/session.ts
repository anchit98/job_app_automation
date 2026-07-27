import { randomUUID } from "crypto";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { dbGet, dbRun } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "applyforge_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  must_reset_password: boolean;
};

function secretKey() {
  return new TextEncoder().encode(env.authSecret());
}

function expiryIso(days = SESSION_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function createSession(
  userId: string,
  claims?: {
    email?: string;
    full_name?: string | null;
    is_admin?: boolean;
    must_reset_password?: boolean;
  },
): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = expiryIso();
  await dbRun(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    sessionId,
    userId,
    expiresAt,
  );

  const token = await new SignJWT({
    sid: sessionId,
    uid: userId,
    email: claims?.email ?? undefined,
    name: claims?.full_name ?? undefined,
    is_admin: claims?.is_admin ?? false,
    must_reset_password: claims?.must_reset_password ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return sessionId;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      const sid = typeof payload.sid === "string" ? payload.sid : null;
      if (sid) {
        await dbRun(`DELETE FROM sessions WHERE id = ?`, sid);
      }
    } catch {
      /* ignore invalid token */
    }
  }
  jar.delete(SESSION_COOKIE);
}

export async function readSessionToken(
  token: string | undefined | null,
): Promise<{ sessionId: string; userId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    const uid = typeof payload.uid === "string" ? payload.uid : null;
    if (!sid || !uid) return null;

    const row = (await dbGet(
      `SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND user_id = ?`,
      sid,
      uid,
    )) as { id: string; user_id: string; expires_at: string } | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await dbRun(`DELETE FROM sessions WHERE id = ?`, sid);
      return null;
    }
    return { sessionId: sid, userId: uid };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<{
  sessionId: string;
  userId: string;
} | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Request-scoped: React.cache dedupes across layout + parallel page fetches
 * so we don't hit sessions/users once per query helper.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    const uid = typeof payload.uid === "string" ? payload.uid : null;
    if (!sid || !uid) return null;

    // One round-trip: validate session + load user
    const row = (await dbGet(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.full_name,
              u.is_admin, u.must_reset_password
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.user_id = ?`,
      sid,
      uid,
    )) as
      | {
          session_id: string;
          expires_at: string;
          id: string;
          email: string;
          full_name: string | null;
          is_admin: boolean;
          must_reset_password: boolean;
        }
      | undefined;

    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await dbRun(`DELETE FROM sessions WHERE id = ?`, sid);
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      is_admin: Boolean(row.is_admin),
      must_reset_password: Boolean(row.must_reset_password),
    };
  } catch {
    return null;
  }
});
