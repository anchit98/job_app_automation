import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "applyforge_session";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/_next",
  "/favicon",
  "/brand",
  "/api/extension",
  "/api/cron",
];

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    // Logged-in users hitting login/signup → dashboard
    if (pathname === "/login" || pathname === "/signup") {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (token && process.env.AUTH_SECRET) {
        try {
          await jwtVerify(
            token,
            new TextEncoder().encode(process.env.AUTH_SECRET),
          );
          return NextResponse.redirect(new URL("/dashboard", request.url));
        } catch {
          /* continue to auth page */
        }
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !process.env.AUTH_SECRET) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  try {
    await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    return NextResponse.next();
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
