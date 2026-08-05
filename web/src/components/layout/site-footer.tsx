"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP_SHELL_PREFIXES = [
  "/dashboard",
  "/apply-beta",
  "/apply",
  "/applications",
  "/billing",
  "/settings",
  "/admin-center",
  "/onboarding",
  "/pipeline",
  "/prompts",
  "/health",
];

function isAppShellPath(pathname: string) {
  return APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isBillingPath(pathname: string) {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

/**
 * Root chrome: sticky footer by default. On billing desktop, pin header+footer
 * and scroll only the main area when zoomed. Mobile keeps natural page scroll.
 */
export function RootChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lockViewport = isBillingPath(pathname);

  return (
    <div
      className={
        lockViewport
          ? "flex min-h-[100dvh] flex-col md:h-[100dvh] md:overflow-hidden"
          : "flex min-h-[100dvh] flex-col"
      }
    >
      <div
        className={
          lockViewport
            ? "flex min-h-0 flex-1 flex-col md:min-h-0 md:overflow-hidden"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();
  if (pathname === "/") {
    return null;
  }
  const onBilling = isBillingPath(pathname);
  // Billing: show footer on all breakpoints and keep page short (no bottom nav).
  const hideOnMobile = isAppShellPath(pathname) && !onBilling;
  const compact = onBilling;

  return (
    <footer
      className={`relative z-20 shrink-0 border-t border-border-hairline bg-surface ${
        hideOnMobile ? "hidden md:block" : "block"
      }`}
    >
      <div
        className={`mx-auto flex max-w-content-max flex-col items-center gap-2 px-margin-mobile text-center text-[13px] text-on-surface-variant md:flex-row md:items-center md:justify-between md:text-left md:px-margin-desktop ${
          compact ? "py-2.5" : "gap-3 py-4"
        }`}
      >        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
          <Link
            href="/privacy-policy"
            className="font-semibold text-on-surface-variant no-underline hover:text-on-surface hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="font-semibold text-on-surface-variant no-underline hover:text-on-surface hover:underline"
          >
            Terms of Service
          </Link>
        </div>
        <p>© {year} JobApp OS. All rights reserved.</p>
      </div>
    </footer>
  );
}
