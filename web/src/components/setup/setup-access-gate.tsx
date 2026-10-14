"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setupAllowed } from "@/lib/setup/setup-paths";
import { PageLoader } from "@/components/ui/page-loader";

/**
 * Client-side backup when server x-pathname is missing: a user with
 * incomplete setup is sent to /onboarding.
 * Uses a full document navigation — soft replace often left a blank shell.
 *
 * No longer conditional on having paid. Setup is what Apply needs to run at
 * all, and since the free plan can run Apply, everyone goes through it.
 */
export function SetupAccessGate({
  setupReady,
  children,
}: {
  setupReady: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const locked = !setupReady && pathname && !setupAllowed(pathname);

  useEffect(() => {
    if (!locked) return;
    window.location.replace("/onboarding");
  }, [locked]);

  if (locked) {
    return <PageLoader label="Opening setup…" compact />;
  }

  return <>{children}</>;
}
