"use client";

import { useRouter } from "next/navigation";

const LEGAL_PATHS = new Set(["/privacy-policy", "/terms", "/contact"]);

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function LegalBackLink() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        const referrer =
          typeof document !== "undefined" ? document.referrer : "";

        if (referrer) {
          try {
            const url = new URL(referrer);
            const sameOrigin = url.origin === window.location.origin;
            const fromLegal = LEGAL_PATHS.has(normalizePath(url.pathname));
            if (sameOrigin && !fromLegal) {
              router.back();
              return;
            }
          } catch {
            // Ignore malformed referrers and fall through.
          }
        } else if (
          typeof window !== "undefined" &&
          window.history.length > 1
        ) {
          // Next.js <Link> navigations often leave document.referrer empty.
          router.back();
          return;
        }

        // Public legal/support pages should land on the marketing home,
        // not /dashboard (which forces login for signed-out visitors).
        router.push("/");
      }}
      className="li-meta mb-3 inline-flex min-h-10 items-center gap-1 hover:text-primary"
    >
      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
      Back
    </button>
  );
}
