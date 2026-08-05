"use client";

import { useEffect, useState } from "react";
import { GoogleConnectPanel } from "@/components/google/google-connect-panel";

/**
 * Connect Google modal for step 1 of setup.
 * Can be dismissed with the close control; connect remains available on the page.
 */
export function GoogleConnectModal({
  open,
  initialConnected,
  googleError,
}: {
  open: boolean;
  initialConnected: boolean;
  googleError?: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (open) setDismissed(false);
  }, [open]);

  if (!open || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-connect-modal-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border-hairline bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-[var(--ghost-hover)] hover:text-on-surface"
          aria-label="Close"
          title="Close"
        >
          <span className="material-symbols-outlined text-[22px]" aria-hidden>
            close
          </span>
        </button>
        <div className="bg-[linear-gradient(118deg,color-mix(in_srgb,var(--primary-container)_75%,var(--surface))_0%,var(--surface)_100%)] px-5 pt-5 pb-4 pr-12 border-b border-border-hairline">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            <span className="material-symbols-outlined text-[14px]">looks_one</span>
            Step 1 of setup
          </span>
          <h2
            id="google-connect-modal-title"
            className="mt-2 text-[18px] font-bold text-on-surface leading-snug"
          >
            Connect Google first
          </h2>
          <p className="mt-1.5 text-[13px] text-on-surface-variant leading-6">
            JobApp OS needs Drive, Docs, and Gmail draft access to generate
            resumes, cover letters, and outreach. This is a one-time permission —
            do it before filling your profile.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <GoogleConnectPanel
            embedded
            initialConnected={initialConnected}
            googleError={googleError}
          />
          <p className="text-[12px] text-on-surface-variant text-center">
            After you allow access, you&apos;ll return here to finish your
            profile. You can also close this and connect from the page.
          </p>
        </div>
      </div>
    </div>
  );
}
