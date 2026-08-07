"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Drop one-shot google_* query flags after the page has rendered. */
export function GoogleOAuthQueryCleaner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (
      !searchParams.has("google_connected") &&
      !searchParams.has("google_error")
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      router.replace(pathname, { scroll: false });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [pathname, router, searchParams]);

  return null;
}
