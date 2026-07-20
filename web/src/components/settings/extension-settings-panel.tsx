"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ensureExtensionToken,
  getExtensionTokenStatus,
  revokeExtensionTokenAction,
  rotateExtensionToken,
} from "@/app/actions/extension";

export function ExtensionSettingsPanel() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    configured: boolean;
    token_prefix: string | null;
    created_at: string | null;
  } | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      await ensureExtensionToken();
      setStatus(await getExtensionTokenStatus());
    })();
  }, []);

  useEffect(() => {
    const check = async () => {
      const bridge = (
        window as unknown as {
          __JOBAPP_BRIDGE__?: { ping: () => Promise<{ ok?: boolean; hasToken?: boolean }> };
        }
      ).__JOBAPP_BRIDGE__;
      if (!bridge?.ping) {
        setBridgeOk(false);
        return;
      }
      try {
        const res = await bridge.ping();
        setBridgeOk(Boolean(res?.ok && res?.hasToken));
      } catch {
        setBridgeOk(false);
      }
    };
    void check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  return (
    <div className="li-card p-4 space-y-4">
      <div>
        <h2 className="li-section-title">
          JobApp Bridge (Chrome extension)
        </h2>
        <p className="li-meta mt-1">
          Required for auto-apply. Without it, pipelines stop at ChatGPT steps.
          Side-load from the <code className="text-[12px]">extension/</code> folder.
        </p>
      </div>

      <div className="text-[13px] text-on-surface-variant space-y-1">
        <p>
          App token:{" "}
          <span className="text-on-surface">
            {status?.configured
              ? `Active (${status.token_prefix}…)`
              : "Creating…"}
          </span>
        </p>
        <p>
          Extension on this page:{" "}
          <span className="text-on-surface">
            {bridgeOk == null
              ? "checking…"
              : bridgeOk
                ? "connected with token"
                : "not detected or token missing in Options"}
          </span>
        </p>
        <p>
          App URL for Options: <code className="text-[12px]">{appUrl}</code>
        </p>
      </div>

      <ol className="list-decimal pl-5 text-[13px] text-on-surface-variant space-y-1">
        <li>
          Open <code className="text-[12px]">chrome://extensions</code> → enable Developer
          mode → Load unpacked → choose this repo&apos;s{" "}
          <code className="text-[12px]">extension/</code> folder (reload after updates).
        </li>
        <li>Click the extension → Options.</li>
        <li>
          Set App URL to <code className="text-[12px]">{appUrl}</code> and paste the token
          below → Save.
        </li>
      </ol>

      {newToken && (
        <div className="rounded-lg border border-primary/30 bg-info-container p-3 space-y-2">
          <p className="text-[12px] font-semibold text-on-surface">
            Copy this token into the extension Options — it won&apos;t be shown again.
          </p>
          <code className="block text-[11px] break-all bg-surface border border-border-hairline p-2 rounded-lg">
            {newToken}
          </code>
          <button
            type="button"
            className="text-[12px] text-primary font-semibold underline"
            onClick={() => navigator.clipboard.writeText(newToken)}
          >
            Copy token
          </button>
        </div>
      )}

      {message && (
        <p className="li-meta">{message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await rotateExtensionToken();
              setNewToken(result.token);
              setMessage("Token rotated — update it in the extension Options.");
              setStatus(await getExtensionTokenStatus());
            })
          }
          className="li-btn-primary text-[13px] disabled:opacity-50"
        >
          {status?.configured ? "Rotate token" : "Generate token"}
        </button>
        {status?.configured && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await revokeExtensionTokenAction();
                setNewToken(null);
                setMessage("Token revoked.");
                setStatus(await getExtensionTokenStatus());
              })
            }
            className="li-btn-secondary text-[13px] disabled:opacity-50"
          >
            Revoke token
          </button>
        )}
      </div>
    </div>
  );
}
