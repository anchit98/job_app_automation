/**
 * Begin "Continue with Google".
 *
 * Distinct from `/api/auth/google/start`, which grants Drive and Docs to a
 * user who is already signed in. This one runs with no session, asks for
 * identity scopes only, and ends in a session rather than a token row.
 */
import { NextResponse } from "next/server";
import { appCookieOptions } from "@/lib/auth/cookie-options";
import {
  SIGNIN_STATE_COOKIE,
  createSignInState,
  getGoogleSignInUrl,
} from "@/lib/auth/google-signin";
import { hasGoogleConfig } from "@/lib/env";

export async function GET(request: Request) {
  if (!hasGoogleConfig()) {
    return NextResponse.redirect(
      new URL("/login?oauth_error=not_configured", request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const state = createSignInState(searchParams.get("next") ?? "/dashboard");

  const response = NextResponse.redirect(getGoogleSignInUrl(state));
  // The state is signed, so the cookie is a second factor rather than the
  // only one — but it is what ties the callback to *this* browser, and the
  // same-tab check is cheap.
  response.cookies.set(
    SIGNIN_STATE_COOKIE,
    state,
    appCookieOptions({ maxAge: 600 }),
  );
  return response;
}
