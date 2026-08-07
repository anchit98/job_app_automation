import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth/user";
import { env } from "@/lib/env";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { verifyGoogleOAuthState } from "@/lib/google/oauth-state";
import { saveGoogleTokens } from "@/lib/google/tokens";

function onboardingUrl(request: Request, query: Record<string, string>) {
  const base = env.publicAppUrlFromHeaders(
    new Headers({
      host: request.headers.get("x-forwarded-host") || request.headers.get("host") || "",
      "x-forwarded-proto":
        request.headers.get("x-forwarded-proto") ||
        (request.url.startsWith("https") ? "https" : "http"),
    }),
  );
  const url = new URL("/onboarding", `${base}/`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const desc = searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      onboardingUrl(request, { google_error: desc }),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      onboardingUrl(request, { google_error: "missing_code" }),
    );
  }

  let user;
  try {
    user = await requireUser();
  } catch {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/onboarding");
    return NextResponse.redirect(login);
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

  const clearState = NextResponse.redirect(
    onboardingUrl(request, { google_error: "invalid_state" }),
  );
  clearState.cookies.set("google_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  if (!stateOk) {
    return clearState;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600_000);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        onboardingUrl(request, {
          google_error:
            "Google did not return a refresh token. Disconnect JobApp OS in your Google Account permissions, then connect again.",
        }),
      );
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
    success.cookies.set("google_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return success;
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(
      onboardingUrl(request, { google_error: message }),
    );
  }
}
