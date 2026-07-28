import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "applyforge_session";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/review-payment",
  "/privacy-policy",
  "/terms",
  "/_next",
  "/favicon",
  "/brand",
  "/api/extension",
  "/api/cron",
  "/api/health",
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

  if (isPublic(pathname)) {
    // Logged-in users hitting login/signup → dashboard
    if (
      pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/forgot-password"
    ) {
      if (sessionPayload?.must_reset_password) {
        return NextResponse.redirect(
          new URL("/reset-password-required", request.url),
        );
      }
      if (sessionPayload) {
        // Unpaid users land on billing; paid status is checked in app layout.
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  if (!token || !process.env.AUTH_SECRET) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    const mustReset = Boolean(payload.must_reset_password);
    if (mustReset && pathname !== "/reset-password-required") {
      return NextResponse.redirect(
        new URL("/reset-password-required", request.url),
      );
    }
    if (!mustReset && pathname === "/reset-password-required") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    const res = NextResponse.redirect(login);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
