"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGoogleAccount } from "@/app/actions/google";

/**
 * Compact Google account control for onboarding:
 * status icon top-right → dropdown with Connect / Disconnect.
 */
export function GoogleAccountMenu({
  connected,
  googleError,
}: {
  connected: boolean;
  googleError?: string | null;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [isConnected, setIsConnected] = useState(connected);

  useEffect(() => {
    setIsConnected(connected);
  }, [connected]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleConnect() {
    setOpen(false);
    window.location.href = "/api/auth/google/start";
  }

  function handleDisconnect() {
    setOpen(false);
    startTransition(async () => {
      await disconnectGoogleAccount();
      setIsConnected(false);
      router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`group relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
          isConnected
            ? "border-success/40 bg-success-container/50 text-success hover:bg-success-container"
            : "border-border-hairline bg-surface-container-low text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface"
        } ${pending ? "opacity-60" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          isConnected ? "Google connected — account options" : "Google not connected"
        }
        title={isConnected ? "Google connected" : "Google not connected"}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">
          {isConnected ? "cloud_done" : "cloud_off"}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
            isConnected ? "bg-success" : "bg-on-surface-variant/50"
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[min(220px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border-hairline bg-surface shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-border-hairline px-3 py-2.5">
            <p className="text-[13px] font-semibold text-on-surface">
              {isConnected ? "Google connected" : "Google not connected"}
            </p>
            <p className="mt-0.5 text-[11px] text-on-surface-variant leading-snug">
              {googleError ? (
                <span className="text-error">{googleError}</span>
              ) : (
                "Drive, Docs & Gmail drafts"
              )}
            </p>
          </div>
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleConnect}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold text-on-surface hover:bg-[var(--ghost-hover)] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">
                link
              </span>
              Connect
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDisconnect}
              disabled={!isConnected || pending}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold text-on-surface hover:bg-[var(--ghost-hover)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                link_off
              </span>
              Disconnect
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
