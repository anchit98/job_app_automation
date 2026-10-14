import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { appCookieOptions } from "@/lib/auth/cookie-options";

/**
 * Clears a cryptographically valid but DB-revoked session cookie (e.g. after
 * global session wipe) and sends the browser to login. Used when app layout
 * finds no SessionUser but proxy still passed a JWT.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/login";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/login";

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  response.cookies.set(
    SESSION_COOKIE,
    "",
    appCookieOptions({ maxAge: 0 }),
  );
  // Also clear host-only cookie if Domain-scoped clear misses it.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
