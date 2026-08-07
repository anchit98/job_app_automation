import { randomUUID } from "crypto";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { appCookieOptions } from "@/lib/auth/cookie-options";
import { dbGet, dbRun } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "applyforge_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export type SessionUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  must_reset_password: boolean;
  is_paid: boolean;
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
    is_paid?: boolean;
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

  const isAdmin = claims?.is_admin ?? false;
  const token = await new SignJWT({
    sid: sessionId,
    uid: userId,
    email: claims?.email ?? undefined,
    name: claims?.full_name ?? undefined,
    is_admin: isAdmin,
    must_reset_password: claims?.must_reset_password ?? false,
    is_paid: isAdmin || Boolean(claims?.is_paid),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    token,
    appCookieOptions({ maxAge: SESSION_MAX_AGE }),
  );

  return sessionId;
}

/** Re-attach session JWT onto a Route Handler redirect (survives host flips). */
export async function attachSessionCookie(response: NextResponse): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  response.cookies.set(
    SESSION_COOKIE,
    token,
    appCookieOptions({ maxAge: SESSION_MAX_AGE }),
  );
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
  // Must clear with the same Domain as set, or the browser keeps the cookie.
  jar.set(SESSION_COOKIE, "", appCookieOptions({ maxAge: 0 }));
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
 * Auth must never block page rendering: if the session DB validation can't
 * answer quickly (pool congestion / slow pooler), fall back to JWT claims
 * instead of holding the whole request for the 8s+ client query timeout.
 */
const AUTH_DB_TIMEOUT_MS = 2_500;

function raceAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Auth session validation timed out after ${AUTH_DB_TIMEOUT_MS}ms`),
      );
    }, AUTH_DB_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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

    const email =
      typeof payload.email === "string" ? payload.email : null;
    const fullName =
      typeof payload.name === "string" ? payload.name : null;
    const isAdmin = Boolean(payload.is_admin);
    const mustReset = Boolean(payload.must_reset_password);
    const paidClaim =
      typeof payload.is_paid === "boolean" ? payload.is_paid : undefined;
    const jwtFallback: SessionUser = {
      id: uid,
      email: email ?? "",
      full_name: fullName,
      is_admin: isAdmin,
      must_reset_password: mustReset,
      // Prefer JWT claim when present; otherwise keep access open during a DB
      // blip so paid users aren't hard-locked (pages still degrade soft).
      is_paid: isAdmin || (paidClaim ?? true),
    };

    try {
      // One round-trip: validate session + load user
      const row = (await raceAuthTimeout(
        dbGet(
          `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.full_name,
                  u.is_admin, u.must_reset_password, u.is_paid
             FROM sessions s
             INNER JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.user_id = ?`,
          sid,
          uid,
        ),
      )) as
        | {
            session_id: string;
            expires_at: string;
            id: string;
            email: string;
            full_name: string | null;
            is_admin: boolean;
            must_reset_password: boolean;
            is_paid: boolean;
          }
        | undefined;

      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await dbRun(`DELETE FROM sessions WHERE id = ?`, sid).catch(() => {});
        return null;
      }

      return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        is_admin: Boolean(row.is_admin),
        must_reset_password: Boolean(row.must_reset_password),
        is_paid: Boolean(row.is_admin) || Boolean(row.is_paid),
      };
    } catch (error) {
      // Transient DB / pool errors must not look like a logged-out session —
      // that produced blank screens and "session crashed" for many users.
      console.error("[auth] session DB lookup failed; using JWT claims:", error);
      if (!email) return null;
      return jwtFallback;
    }
  } catch {
    return null;
  }
});
