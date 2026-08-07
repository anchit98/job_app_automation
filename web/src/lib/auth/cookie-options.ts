/**
 * Shared auth/OAuth cookie options. In production, set Domain to the
 * registrable host (e.g. jobappos.in) so www + apex share the session —
 * otherwise Google OAuth / payment redirects can look like a logout.
 */

export function cookieDomain(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw || process.env.NODE_ENV !== "production") return undefined;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.startsWith("127.") ||
      host.endsWith(".vercel.app")
    ) {
      return undefined;
    }
    return host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function appCookieOptions(overrides?: {
  maxAge?: number;
  httpOnly?: boolean;
}): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
  domain?: string;
} {
  const domain = cookieDomain();
  return {
    httpOnly: overrides?.httpOnly ?? true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(typeof overrides?.maxAge === "number" ? { maxAge: overrides.maxAge } : {}),
    ...(domain ? { domain } : {}),
  };
}
