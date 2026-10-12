/**
 * "Continue with Google" — sign-in, not Drive access.
 *
 * Deliberately separate from `lib/google/oauth`, which asks for `drive.file`
 * and `documents` on behalf of a user who is *already* signed in. This flow
 * asks for nothing but identity, runs before there is a session, and stores no
 * tokens: the id token is read once to learn who the person is and then
 * discarded. Sharing a client id with the other flow is fine — sharing scopes
 * would not be, since every extra permission on a sign-in button is a
 * permission people decline.
 *
 * The signed `state` is the CSRF defence. The version in `lib/google/oauth-state`
 * binds to a user id, which does not exist yet here, so this one binds to a
 * nonce and a timestamp instead and is checked against the cookie set at the
 * start of the round trip.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { google } from "googleapis";
import { env } from "@/lib/env";

/** Identity only. No Drive, no Docs, and above all no mail. */
const SIGNIN_SCOPES = ["openid", "email", "profile"] as const;

const STATE_TTL_MS = 10 * 60 * 1000;

/** Cookie holding the state for the current sign-in round trip. */
export const SIGNIN_STATE_COOKIE = "google_signin_state";

export interface GoogleIdentity {
  /** Google's stable subject id — the thing we key the account on. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

function sign(payload: string): string {
  return createHmac("sha256", env.authSecret()).update(payload).digest("hex");
}

/**
 * A state token bound to the redirect the user should land on.
 *
 * Carrying `next` inside the signed state rather than as its own query
 * parameter is what stops it being an open redirect: the callback will only
 * honour a path this server signed.
 */
export function createSignInState(next: string): string {
  const nonce = randomBytes(16).toString("hex");
  const ts = String(Date.now());
  const safeNext = sanitizeNext(next);
  const payload = `${nonce}.${ts}.${encodeURIComponent(safeNext)}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySignInState(
  state: string | null | undefined,
): { ok: true; next: string } | { ok: false } {
  if (!state) return { ok: false };
  const parts = state.split(".");
  if (parts.length !== 4) return { ok: false };
  const [nonce, ts, nextEncoded, sig] = parts;
  if (!nonce || !ts || !sig) return { ok: false };

  const created = Number(ts);
  if (!Number.isFinite(created)) return { ok: false };
  if (Date.now() - created > STATE_TTL_MS) return { ok: false };
  if (created > Date.now() + 60_000) return { ok: false };

  const payload = `${nonce}.${ts}.${nextEncoded}`;
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(sign(payload), "hex");
    if (a.length !== b.length) return { ok: false };
    if (!timingSafeEqual(a, b)) return { ok: false };
  } catch {
    return { ok: false };
  }

  return { ok: true, next: sanitizeNext(decodeURIComponent(nextEncoded)) };
}

/**
 * Only same-origin paths survive.
 *
 * `//evil.com` is a protocol-relative URL that a browser treats as absolute,
 * so "starts with /" is not enough on its own.
 */
export function sanitizeNext(next: string | null | undefined): string {
  const value = (next ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function signInClient() {
  return new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    signInRedirectUri(),
  );
}

/**
 * Its own redirect URI, registered alongside the Drive one in the console.
 *
 * Two flows cannot share a callback: the Drive callback requires a session and
 * saves tokens, and routing an identity code into it would either be rejected
 * or store a token set with no Drive access at all.
 */
export function signInRedirectUri(): string {
  return `${env.canonicalAppUrl().replace(/\/$/, "")}/api/auth/oauth/google/callback`;
}

export function getGoogleSignInUrl(state: string): string {
  return signInClient().generateAuthUrl({
    scope: [...SIGNIN_SCOPES],
    state,
    // No refresh token is wanted: nothing here is called again on the user's
    // behalf, so asking for offline access would be collecting a credential
    // with no use for it.
    access_type: "online",
    include_granted_scopes: false,
    prompt: "select_account",
  });
}

/**
 * Exchange the code and read the identity out of the id token.
 *
 * `verifyIdToken` checks the signature, the issuer and the audience against
 * our own client id — without that last check a token minted for a different
 * application would be accepted, which is the classic way this flow is broken.
 */
export async function exchangeCodeForGoogleIdentity(
  code: string,
): Promise<GoogleIdentity> {
  const client = signInClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error("Google did not return an id token.");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.googleClientId(),
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google did not return an email address.");
  }

  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name?.trim() || null,
  };
}
