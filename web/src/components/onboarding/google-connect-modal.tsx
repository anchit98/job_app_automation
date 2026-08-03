"use client";

import { GoogleConnectPanel } from "@/components/google/google-connect-panel";

/**
 * Blocking modal: Connect Google is step 1 of one-time setup.
 * Stays open until connected (no dismiss).
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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-connect-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-hairline bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
        <div className="bg-[linear-gradient(118deg,color-mix(in_srgb,var(--primary-container)_75%,var(--surface))_0%,var(--surface)_100%)] px-5 pt-5 pb-4 border-b border-border-hairline">
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
            profile.
          </p>
        </div>
      </div>
    </div>
  );
}
