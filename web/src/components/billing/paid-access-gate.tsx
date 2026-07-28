"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const UNPAID_ALLOWED = [
  "/billing",
  "/settings",
  "/reset-password-required",
];

function unpaidAllowed(pathname: string) {
  return UNPAID_ALLOWED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Client-side paywall: unpaid users see a lock screen on protected routes
 * (and are sent to /billing). Reliable even when server x-pathname is missing.
 */
export function PaidAccessGate({
  isPaid,
  children,
}: {
  isPaid: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locked = !isPaid && !unpaidAllowed(pathname);

  useEffect(() => {
    if (!locked) return;
    router.replace("/billing");
  }, [locked, router]);

  if (locked) {
    return (
      <div className="li-card mx-auto max-w-lg p-8 text-center space-y-4">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">
          lock
        </span>
        <div>
          <h1 className="li-page-title">Access locked</h1>
          <p className="text-[14px] text-on-surface-variant mt-2">
            Complete UPI payment and wait for admin approval to unlock JobApp OS.
          </p>
        </div>
        <Link
          href="/billing"
          className="li-btn-primary inline-flex no-underline justify-center"
        >
          Go to billing
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
