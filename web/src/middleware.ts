import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { appCookieOptions } from "@/lib/auth/cookie-options";

const SESSION_COOKIE = "applyforge_session";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/review-payment",
  "/privacy-policy",
  "/terms",
  "/contact",
  "/_next",
  "/favicon",
  "/brand",
  "/api/extension",
  "/api/cron",
  "/api/health",
  "/api/billing/razorpay/webhook",
  // Clears revoked JWTs that middleware still treats as signed-in.
  "/api/auth/clear-stale-session",
  // Must stay public: Razorpay redirect can drop the session cookie; unlock
  // still runs from signed callback params / API reconcile.
  "/billing/razorpay/return",
];

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let sessionPayload:
    | {
        must_reset_password: boolean;
      }
    | undefined;

  if (token && process.env.AUTH_SECRET) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.AUTH_SECRET),
      );
      sessionPayload = {
        must_reset_password: Boolean(payload.must_reset_password),
      };
    } catch {
      sessionPayload = undefined;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Server Actions POST to the current page (e.g. signIn posts to /login).
  // Redirecting those breaks the action mid-flight — the login form then
  // shows "Sign-in failed" even though the session was created. Only
  // redirect real GET navigations.
  const isGetNavigation = request.method === "GET";

  if (isPublic(pathname)) {
    // Do NOT bounce login/signup to the app based on JWT alone. Sessions can
    // be revoked in the DB while the cookie still verifies (ghost accounts).
    // Auth pages call getCurrentUser() and redirect only when the DB session
    // is real.
    if (
      isGetNavigation &&
      sessionPayload?.must_reset_password &&
      (pathname === "/login" ||
        pathname === "/signup" ||
        pathname === "/forgot-password")
    ) {
      return NextResponse.redirect(
        new URL("/reset-password-required", request.url),
      );
    }
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  if (!token || !process.env.AUTH_SECRET) {
    const login = new URL("/login", request.url);
    // Preserve query string (Razorpay callback params) through login.
    const nextTarget = `${pathname}${request.nextUrl.search}`;
    login.searchParams.set("next", nextTarget);
    return NextResponse.redirect(login);
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    const mustReset = Boolean(payload.must_reset_password);
    if (isGetNavigation && mustReset && pathname !== "/reset-password-required") {
      return NextResponse.redirect(
        new URL("/reset-password-required", request.url),
      );
    }
    if (isGetNavigation && !mustReset && pathname === "/reset-password-required") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    const login = new URL("/login", request.url);
    const nextTarget = `${pathname}${request.nextUrl.search}`;
    login.searchParams.set("next", nextTarget);
    const res = NextResponse.redirect(login);
    res.cookies.set(SESSION_COOKIE, "", appCookieOptions({ maxAge: 0 }));
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
