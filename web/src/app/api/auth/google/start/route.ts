import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env, hasGoogleConfig } from "@/lib/env";
import { getGoogleAuthUrl } from "@/lib/google/oauth";
import { createGoogleOAuthState } from "@/lib/google/oauth-state";
import { getCurrentUser } from "@/lib/auth/user";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!hasGoogleConfig()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured" },
      { status: 503 },
    );
  }

  const state = createGoogleOAuthState(user.id);
  const url = getGoogleAuthUrl(state);

  // Set cookie on the redirect response (cookies().set alone can be dropped
  // on some Route Handler redirects). Signed `state` is the source of truth.
  const response = NextResponse.redirect(url);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
