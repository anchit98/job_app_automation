/** Routes that stay open while one-time setup is incomplete. */
export const SETUP_ALLOWED_PREFIXES = [
  "/onboarding",
  "/settings",
  "/billing",
  "/reset-password-required",
  "/health",
  "/admin-center",
  "/privacy-policy",
  "/terms",
] as const;

export function setupAllowed(pathname: string): boolean {
  return SETUP_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Paths that require full setup when the user is paid. */
export function setupLockedPath(pathname: string): boolean {
  if (setupAllowed(pathname)) return false;
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/apply" ||
    pathname.startsWith("/apply/") ||
    pathname === "/" ||
    pathname === "/applications" ||
    pathname.startsWith("/applications/") ||
    pathname.startsWith("/pipeline/")
  );
}
