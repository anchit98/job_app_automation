"use client";

import { useEffect } from "react";
import { PageLoader } from "@/components/ui/page-loader";

/**
 * Full document navigation — safe when a Server Component must leave the app
 * shell. Do not use redirect() from layouts during Flight refreshes after
 * Server Actions; that surfaces as an opaque production digest error.
 */
export function HardRedirect({
  href,
  label = "Signing you in…",
}: {
  href: string;
  label?: string;
}) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return <PageLoader label={label} compact />;
}
