import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Signed OAuth `state` bound to the logged-in user. Prefer this over a bare
 * cookie: Google echoes `state` back, so we still validate CSRF + user binding
 * even if the `google_oauth_state` cookie is dropped on the redirect (common
 * www/apex or SameSite edge cases → invalid_state + no tokens saved).
 */
export function createGoogleOAuthState(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const ts = String(Date.now());
  const payload = `${userId}.${nonce}.${ts}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyGoogleOAuthState(
  state: string | null | undefined,
  userId: string,
): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [uid, nonce, ts, sig] = parts;
  if (!uid || !nonce || !ts || !sig) return false;
  if (uid !== userId) return false;
  const created = Number(ts);
  if (!Number.isFinite(created) || Date.now() - created > STATE_TTL_MS) {
    return false;
  }
  if (created > Date.now() + 60_000) return false;

  const payload = `${uid}.${nonce}.${ts}`;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", env.authSecret()).update(payload).digest("hex");
}
