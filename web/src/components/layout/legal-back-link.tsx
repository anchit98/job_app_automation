"use client";

import { useRouter } from "next/navigation";

export function LegalBackLink() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        const referrer = typeof document !== "undefined" ? document.referrer : "";
        const sameOrigin =
          referrer.startsWith(window.location.origin) &&
          !referrer.includes("/privacy-policy") &&
          !referrer.includes("/terms");
        if (sameOrigin) {
          router.back();
          return;
        }
        router.push("/dashboard");
      }}
      className="li-meta mb-3 inline-flex min-h-10 items-center gap-1 hover:text-primary"
    >
      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
      Back
    </button>
  );
}
