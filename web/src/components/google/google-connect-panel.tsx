"use client";

import { useState, useTransition } from "react";
import {
  disconnectGoogleAccount,
} from "@/app/actions/google";

interface GoogleConnectPanelProps {
  initialConnected: boolean;
  googleError?: string | null;
  googleConnected?: boolean;
}

export function GoogleConnectPanel({
  initialConnected,
  googleError,
}: GoogleConnectPanelProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [error] = useState<string | null>(googleError ?? null);
  const [pending, startTransition] = useTransition();

  function handleConnect() {
    window.location.href = "/api/auth/google/start";
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectGoogleAccount();
      setConnected(false);
    });
  }

  return (
    <div className="li-card p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="bg-primary-container p-2 rounded-lg shrink-0">
          <span
            className={`material-symbols-outlined ${
              connected ? "text-success" : "text-on-surface-variant"
            }`}
          >
            {connected ? "cloud_done" : "cloud_off"}
          </span>
        </div>
        <div className="min-w-0">
          <h4 className="text-[14px] font-semibold text-on-surface truncate">
            {connected ? "Google connected" : "Connect Google"}
          </h4>
          <p className="li-meta truncate">
            {error ? (
              <span className="text-error">{error}</span>
            ) : connected ? (
              "Drive + Gmail drafts"
            ) : (
              "Required for docs & drafts"
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={connected ? handleDisconnect : handleConnect}
        disabled={pending}
        className={connected ? "li-btn-ghost text-[13px]" : "li-btn-secondary text-[13px]"}
      >
        {pending ? "…" : connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
}
