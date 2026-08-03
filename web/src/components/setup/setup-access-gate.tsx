"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setupAllowed } from "@/lib/setup/setup-paths";

/**
 * Client-side backup when server x-pathname is missing:
 * paid users with incomplete setup are sent to /onboarding.
 */
export function SetupAccessGate({
  setupReady,
  isPaid,
  children,
}: {
  setupReady: boolean;
  isPaid: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locked =
    isPaid && !setupReady && pathname && !setupAllowed(pathname);

  useEffect(() => {
    if (!locked) return;
    router.replace("/onboarding");
  }, [locked, router]);

  if (locked) {
    return (
      <div className="li-card mx-auto max-w-lg p-8 text-center space-y-4">
        <span className="material-symbols-outlined text-[40px] text-primary">
          checklist
        </span>
        <div>
          <h1 className="li-page-title">Finish one-time setup</h1>
          <p className="text-[14px] text-on-surface-variant mt-2">
            Connect Google and complete your profile &amp; master resume before
            using Dashboard or Apply.
          </p>
        </div>
        <a
          href="/onboarding"
          className="li-btn-primary inline-flex no-underline justify-center"
        >
          Continue setup
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
