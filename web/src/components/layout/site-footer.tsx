"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const APP_SHELL_PREFIXES = [
  "/dashboard",
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
  const hideOnMobile = isAppShellPath(pathname);

  return (
    <footer
      className={`border-t border-border-hairline bg-surface ${
        hideOnMobile ? "hidden md:block" : "block"
      }`}
    >
      <div className="mx-auto flex max-w-content-max flex-col gap-3 px-margin-mobile py-4 text-[13px] text-on-surface-variant md:flex-row md:items-center md:justify-between md:px-margin-desktop">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
