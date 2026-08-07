import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeAuditLog } from "@/lib/audit";
import { appCookieOptions } from "@/lib/auth/cookie-options";
import { attachSessionCookie } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/user";
import { env } from "@/lib/env";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { verifyGoogleOAuthState } from "@/lib/google/oauth-state";
import { saveGoogleTokens } from "@/lib/google/tokens";

/** Preview / loopback hosts must never become the post-OAuth return origin. */
function isEphemeralOrigin(urlOrHost: string): boolean {
  return /localhost|127\.0\.0\.1|\.vercel\.app/i.test(urlOrHost);
}

/**
 * Prefer the configured production origin so post-OAuth redirects always land
 * on the same host as GOOGLE_OAUTH_REDIRECT_URI / NEXT_PUBLIC_APP_URL
 * (e.g. https://www.jobappos.in) — never the Vercel *.vercel.app deployment URL.
 * Fall back to the request host only for local/dev.
 */
function oauthReturnOrigin(request: Request): string {
  const configured = env.appUrl().replace(/\/$/, "");
  if (/^https:\/\//i.test(configured) && !isEphemeralOrigin(configured)) {
    return configured;
  }
  const fromRequest = env.publicAppUrlFromHeaders(
    new Headers({
      host:
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        "",
      "x-forwarded-proto":
        request.headers.get("x-forwarded-proto") ||
        (request.url.startsWith("https") ? "https" : "http"),
    }),
  );
  if (!isEphemeralOrigin(fromRequest)) return fromRequest;
  // Misconfigured production still prefers NEXT_PUBLIC_APP_URL over request host.
  return configured || fromRequest;
}

function onboardingUrl(request: Request, query: Record<string, string>) {
  const url = new URL("/onboarding", `${oauthReturnOrigin(request)}/`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function clearOAuthState(response: NextResponse) {
  response.cookies.set(
    "google_oauth_state",
    "",
    appCookieOptions({ maxAge: 0 }),
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const desc = searchParams.get("error_description") ?? error;
    const res = NextResponse.redirect(
      onboardingUrl(request, { google_error: desc }),
    );
    clearOAuthState(res);
    await attachSessionCookie(res);
    return res;
  }

  if (!code || !state) {
    const res = NextResponse.redirect(
      onboardingUrl(request, { google_error: "missing_code" }),
    );
    clearOAuthState(res);
    await attachSessionCookie(res);
    return res;
  }

  let user;
  try {
    user = await requireUser();
  } catch {
    // Session cookie often missing on apex↔www after Google redirect.
    // Send them to login on the canonical host with a clear reason.
    const login = new URL("/login", `${oauthReturnOrigin(request)}/`);
    login.searchParams.set("next", "/onboarding");
    login.searchParams.set("google_error", "session_lost");
    const res = NextResponse.redirect(login.toString());
    clearOAuthState(res);
    return res;
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  // Signed state is authoritative — it survives lost cookies on the Google
  // round-trip. Cookie is only a soft same-tab hint (ignored if absent/stale).
  const stateOk =
    verifyGoogleOAuthState(state, user.id) ||
    (Boolean(savedState) &&
      savedState === state &&
      verifyGoogleOAuthState(savedState, user.id));

  if (!stateOk) {
    const clearState = NextResponse.redirect(
      onboardingUrl(request, { google_error: "invalid_state" }),
    );
    clearOAuthState(clearState);
    await attachSessionCookie(clearState);
    return clearState;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600_000);

    if (!tokens.refresh_token) {
      const res = NextResponse.redirect(
        onboardingUrl(request, {
          google_error:
            "Google did not return a refresh token. Disconnect JobApp OS in your Google Account permissions, then connect again.",
        }),
      );
      clearOAuthState(res);
      await attachSessionCookie(res);
      return res;
    }

    await saveGoogleTokens(
      tokens.access_token!,
      tokens.refresh_token,
      tokens.scope ?? "",
      expiresAt,
      user.id,
    );

    await writeAuditLog("google.connected", "google_tokens", "session");

    const success = NextResponse.redirect(
      onboardingUrl(request, { google_connected: "1" }),
    );
    clearOAuthState(success);
    // Re-set session on this response so post-OAuth navigation does not drop
    // the user on /login even though Google connect succeeded (www/apex).
    await attachSessionCookie(success);
    return success;
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_failed";
    const res = NextResponse.redirect(
      onboardingUrl(request, { google_error: message }),
    );
    clearOAuthState(res);
    await attachSessionCookie(res);
    return res;
  }
}
