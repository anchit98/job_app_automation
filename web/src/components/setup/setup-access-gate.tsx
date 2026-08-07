"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setupAllowed } from "@/lib/setup/setup-paths";
import { PageLoader } from "@/components/ui/page-loader";

/**
 * Client-side backup when server x-pathname is missing:
 * paid users with incomplete setup are sent to /onboarding.
 * Uses a full document navigation — soft replace often left a blank shell.
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
  const locked =
    isPaid && !setupReady && pathname && !setupAllowed(pathname);

  useEffect(() => {
    if (!locked) return;
    window.location.replace("/onboarding");
  }, [locked]);

  if (locked) {
    return <PageLoader label="Opening setup…" compact />;
  }

  return <>{children}</>;
}
