"use client";

import { useEffect, useState, useTransition } from "react";
import { disconnectGoogleAccount } from "@/app/actions/google";

interface GoogleConnectPanelProps {
  initialConnected: boolean;
  googleError?: string | null;
  googleConnected?: boolean;
  /** When true, omit outer li-card wrapper for embedding in the setup guide. */
  embedded?: boolean;
}

function friendlyGoogleError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key === "invalid_state") {
    return "Google connection was interrupted. Click Connect Google and try again.";
  }
  if (key === "missing_code") {
    return "Google did not return an authorization code. Please try connecting again.";
  }
  if (key.includes("refresh token")) {
    return raw;
  }
  if (key === "access_denied") {
    return "Google access was denied. Allow Drive and Gmail permissions to continue setup.";
  }
  return raw;
}

export function GoogleConnectPanel({
  initialConnected,
  googleError,
  embedded = false,
}: GoogleConnectPanelProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [error, setError] = useState<string | null>(
    friendlyGoogleError(googleError),
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setConnected(initialConnected);
  }, [initialConnected]);

  useEffect(() => {
    setError(friendlyGoogleError(googleError));
  }, [googleError]);

  function handleConnect() {
    window.location.href = "/api/auth/google/start";
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectGoogleAccount();
      setConnected(false);
    });
  }

  const body = (
    <div className="flex items-center justify-between gap-3">
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
        className={
          connected ? "li-btn-ghost text-[13px]" : "li-btn-secondary text-[13px]"
        }
      >
        {pending ? "…" : connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-border-hairline bg-surface p-4">
        {body}
      </div>
    );
  }

  return <div className="li-card p-4">{body}</div>;
}
