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

export function SiteFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();
  if (pathname === "/") {
    return null;
  }
  const hideOnMobile = isAppShellPath(pathname);

  return (
    <footer
      className={`shrink-0 border-t border-border-hairline bg-surface ${
        hideOnMobile ? "hidden md:block" : "block"
      }`}
    >
      <div className="mx-auto flex max-w-content-max flex-col items-center gap-3 px-margin-mobile py-4 text-center text-[13px] text-on-surface-variant md:flex-row md:items-center md:justify-between md:text-left md:px-margin-desktop">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
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
