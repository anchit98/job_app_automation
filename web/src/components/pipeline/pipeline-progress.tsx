"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  advancePipeline,
  getPipelineStatus,
  retryFailedPipeline,
} from "@/app/actions/pipeline";
import { ensureExtensionToken, armExtensionForPromptRun } from "@/app/actions/extension";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/status";
import type { PipelineRunRecord, PipelineStage } from "@/lib/pipeline/types";

function isGoogleReconnectError(message?: string | null): boolean {
  if (!message) return false;
  return /google|drive export|token revoked|not connected|reconnect google/i.test(
    message,
  );
}

function stageIcon(status: PipelineStage["status"]) {
  switch (status) {
    case "completed":
    case "skipped":
      return "check_circle";
    case "running":
    case "awaiting_chatgpt":
      return "progress_activity";
    case "failed":
      return "error";
    default:
      return "radio_button_unchecked";
  }
}

function stagesSettled(pipeline: PipelineRunRecord) {
  return pipeline.stages.every(
    (s) =>
      s.status === "completed" ||
      s.status === "skipped" ||
      s.status === "failed",
  );
}

function pipelineStillActive(pipeline: PipelineRunRecord) {
  if (
    pipeline.status === "running" ||
    pipeline.status === "awaiting_chatgpt" ||
    pipeline.status === "queued"
  ) {
    return true;
  }
  return pipeline.stages.some(
    (s) => s.status === "running" || s.status === "awaiting_chatgpt",
  );
}

async function publishSignal(
  signal: Record<string, unknown>,
  opts?: { clearLock?: boolean },
): Promise<{ ok: boolean; error?: string; reason?: string }> {
  const payload = {
    ...signal,
    ts: Date.now(),
    // Manual "Open ChatGPT" must be allowed to take over a stuck tab.
    force: Boolean(opts?.clearLock),
  };
  try {
    localStorage.setItem("jobapp_pending_prompt_run", JSON.stringify(payload));
  } catch {
    /* ignore */
  }

  // Wake only via bridge.wake() — do NOT also fire jobapp-pending (that double-starts
  // openAndRun and aborts an in-flight paste with force reinject).
  const bridge = (
    window as unknown as {
      __JOBAPP_BRIDGE__?: {
        wake?: (s: Record<string, unknown>) => Promise<{
          ok?: boolean;
          error?: string;
          reason?: string;
          opened?: boolean;
        }>;
        clearLock?: () => Promise<unknown>;
      };
    }
  ).__JOBAPP_BRIDGE__;

  // Manual retry only — periodic re-arms must not kill an in-flight ChatGPT tab.
  if (opts?.clearLock) {
    try {
      await bridge?.clearLock?.();
    } catch {
      /* ignore */
    }
  }

  if (!bridge?.wake) {
    // Fallback if app-bridge.js hasn't injected yet (reload extension).
    window.dispatchEvent(new CustomEvent("jobapp-pending", { detail: payload }));
    return {
      ok: false,
      error:
        "JobApp Bridge not detected on this page. Load/reload the unpacked extension, then hard-refresh this tab.",
    };
  }

  try {
    const res = await bridge.wake(payload);
    if (res?.ok === false || res?.opened === false) {
      const detail =
        res?.error ||
        res?.reason ||
        "Extension did not open ChatGPT.";
      return {
        ok: false,
        error:
          /token/i.test(detail)
            ? `${detail} Open extension Options → paste the token from Settings → Save → reload this page.`
            : detail,
        reason: res?.reason,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Extension wake failed.",
    };
  }
}

function clearPendingSignal() {
  try {
    localStorage.removeItem("jobapp_pending_prompt_run");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("jobapp-clear-pending"));
}

function signaledKey(promptRunId: string) {
  return `jobapp_signaled_${promptRunId}`;
}

function wasAlreadySignaled(promptRunId: string) {
  try {
    return sessionStorage.getItem(signaledKey(promptRunId)) === "1";
  } catch {
    return false;
  }
}

function markSignaled(promptRunId: string) {
  try {
    sessionStorage.setItem(signaledKey(promptRunId), "1");
  } catch {
    /* ignore */
  }
}

function clearSignaled(promptRunId: string) {
  try {
    sessionStorage.removeItem(signaledKey(promptRunId));
  } catch {
    /* ignore */
  }
}

export function PipelineProgress({
  initialPipeline,
  initialApplicationStatus = null,
}: {
  initialPipeline: PipelineRunRecord;
  initialApplicationStatus?: ApplicationStatus | null;
}) {
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatus | null>(
    initialApplicationStatus,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [bridgeConfigured, setBridgeConfigured] = useState(false);
  const [bridgeDetected, setBridgeDetected] = useState<boolean | null>(null);
  const [openedChatGptFor, setOpenedChatGptFor] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<{
    resume_version: number | null;
    cover_letter_version: number | null;
  }>({ resume_version: null, cover_letter_version: null });

  const activeStage = useMemo(
    () =>
      pipeline.stages.find((s) => s.id === pipeline.current_stage) ??
      pipeline.stages.find((s) => s.status === "awaiting_chatgpt"),
    [pipeline],
  );

  const completedCount = pipeline.stages.filter(
    (s) => s.status === "completed" || s.status === "skipped",
  ).length;
  const progressPct = Math.round(
    (completedCount / Math.max(pipeline.stages.length, 1)) * 100,
  );

  const refresh = useCallback(async () => {
    const status = await getPipelineStatus(pipeline.id);
    if (status.ok) {
      setPipeline(status.pipeline);
      if (status.application_status) {
        setApplicationStatus(status.application_status);
      }
      if (status.downloads) {
        setDownloads(status.downloads);
      }
    }
    return status;
  }, [pipeline.id]);

  const tick = useCallback(async () => {
    const advanced = await advancePipeline(pipeline.id);
    if (advanced.pipeline) setPipeline(advanced.pipeline);
    const status = await getPipelineStatus(pipeline.id);
    if (status.ok) {
      if (status.application_status) {
        setApplicationStatus(status.application_status);
      }
      if (status.downloads) {
        setDownloads(status.downloads);
      }
    }
    if (!advanced.ok) {
      setError(advanced.error ?? "Pipeline error");
    } else {
      setError(null);
    }
    return advanced;
  }, [pipeline.id]);

  // Ensure extension token exists (auto-create on first use).
  useEffect(() => {
    void (async () => {
      const result = await ensureExtensionToken();
      setBridgeConfigured(result.configured);
      if (result.created && result.token) {
        setBridgeToken(result.token);
      }
    })();
  }, []);

  // Detect JobApp Bridge content script on this origin.
  useEffect(() => {
    const check = async () => {
      const bridge = (
        window as unknown as {
          __JOBAPP_BRIDGE__?: { ping: () => Promise<{ ok?: boolean; hasToken?: boolean }> };
        }
      ).__JOBAPP_BRIDGE__;
      if (!bridge?.ping) {
        setBridgeDetected(false);
        return;
      }
      try {
        const res = await bridge.ping();
        setBridgeDetected(Boolean(res?.ok));
      } catch {
        setBridgeDetected(false);
      }
    };
    void check();
    const onReady = () => void check();
    window.addEventListener("jobapp-bridge-ready", onReady);
    window.addEventListener("focus", onReady);
    // Faster checks for the first ~12s after mount (extension inject can lag).
    const fast = setInterval(check, 1000);
    const fastStop = setTimeout(() => clearInterval(fast), 12000);
    const id = setInterval(check, 4000);
    return () => {
      window.removeEventListener("jobapp-bridge-ready", onReady);
      window.removeEventListener("focus", onReady);
      clearInterval(fast);
      clearTimeout(fastStop);
      clearInterval(id);
    };
  }, []);

  // Drop stale bridge/arm banners left from a previous tick.
  useEffect(() => {
    if (
      error &&
      (/No pending extension run to arm/i.test(error) ||
        /Bridge not detected|not detected on this page/i.test(error))
    ) {
      setError(null);
    }
    // Only on mount / when those specific errors appear once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (pipelineStillActive(pipeline)) {
        const advanced = await tick();
        if (cancelled) return;
        if (advanced.pipeline) setPipeline(advanced.pipeline);
      }
    })();

    const interval = setInterval(async () => {
      if (cancelled || pending) return;
      // Keep refreshing until every stage is terminal — pipeline.status alone
      // can briefly look "completed" while gmail_drafts is still running.
      const latest = await refresh();
      if (!latest.ok || cancelled) return;
      if (
        stagesSettled(latest.pipeline) &&
        (latest.pipeline.status === "completed" ||
          latest.pipeline.status === "failed" ||
          latest.pipeline.status === "needs_manual")
      ) {
        return;
      }
      if (pipelineStillActive(latest.pipeline)) {
        await tick();
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Re-subscribe when top-level status changes; stage details come from refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid restarting on every stages_json patch
  }, [pipeline.status, pending, refresh, tick]);

  // Keep waking ChatGPT while this stage is waiting (JD parse, resume, etc.).
  // First signal can be missed if the extension wasn't ready; re-arm periodically.
  // Skip auto-wake when Drive export is blocked on Google reconnect.
  useEffect(() => {
    if (
      pipeline.status !== "awaiting_chatgpt" ||
      !activeStage?.prompt_run_id ||
      !activeStage.prompt_text
    ) {
      return;
    }

    const stageError = activeStage.error || pipeline.error;
    if (isGoogleReconnectError(stageError)) {
      setError(stageError);
      return;
    }

    const promptRunId = activeStage.prompt_run_id;
    const signal = {
      prompt_run_id: promptRunId,
      pipeline_run_id: pipeline.id,
      kind: activeStage.id,
      prompt_text: activeStage.prompt_text,
      chatgpt_url: activeStage.chatgpt_url || "https://chatgpt.com/",
    };

    let cancelled = false;
    let inFlight = false;

    async function wakeExtension(opts?: { forceSignal?: boolean }) {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const already = wasAlreadySignaled(promptRunId);
        // Re-arm wake window so a dead tab can still open later; only re-signal
        // ChatGPT on first arm or manual force (interval must not abort paste).
        const armed = await armExtensionForPromptRun(promptRunId, {
          pipeline_run_id: pipeline.id,
          kind: activeStage!.id,
          prompt_text: activeStage!.prompt_text!,
          chatgpt_url: activeStage!.chatgpt_url || "https://chatgpt.com/",
        });
        if (cancelled) return;
        if (!armed.ok) {
          // Soft warn only — do not paint a hard error while the stage is still recoverable.
          console.warn("[pipeline] arm failed", armed.error);
          return;
        }
        if (already && !opts?.forceSignal) {
          return;
        }
        // Retry briefly — race between arm commit and extension consume.
        let woke: { ok: boolean; error?: string; reason?: string } = {
          ok: false,
        };
        for (let attempt = 0; attempt < 4; attempt++) {
          woke = await publishSignal(
            signal,
            attempt === 0 && opts?.forceSignal
              ? { clearLock: true }
              : undefined,
          );
          if (cancelled) return;
          if (woke.ok) break;
          if (
            woke.reason === "not_armed" ||
            /no active wake/i.test(woke.error || "")
          ) {
            await armExtensionForPromptRun(promptRunId, {
              pipeline_run_id: pipeline.id,
              kind: activeStage!.id,
              prompt_text: activeStage!.prompt_text!,
              chatgpt_url: activeStage!.chatgpt_url || "https://chatgpt.com/",
            });
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          break;
        }
        if (!woke.ok) {
          // Bridge missing on this tab is common after SPA nav — keep muted, allow manual open.
          if (
            /bridge|extension|not detected|__JOBAPP/i.test(woke.error || "") ||
            woke.reason === "no_bridge"
          ) {
            return;
          }
          setError(woke.error ?? "Could not wake JobApp Bridge.");
          return;
        }
        markSignaled(promptRunId);
        setOpenedChatGptFor(promptRunId);
        setError(null);
      } finally {
        inFlight = false;
      }
    }

    void wakeExtension({ forceSignal: true });
    // Keep wake_until fresh; do not re-open/reinject ChatGPT every tick.
    const interval = setInterval(() => {
      void wakeExtension({ forceSignal: false });
    }, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    pipeline.status,
    pipeline.id,
    pipeline.error,
    activeStage?.id,
    activeStage?.prompt_run_id,
    activeStage?.prompt_text,
    activeStage?.chatgpt_url,
    activeStage?.error,
  ]);

  // Clear leftover bridge signals when the pipeline finishes.
  useEffect(() => {
    if (
      pipeline.status === "completed" ||
      pipeline.status === "failed" ||
      pipeline.status === "needs_manual"
    ) {
      clearPendingSignal();
    }
  }, [pipeline.status]);

  function wakeExtensionForCurrentStage() {
    if (!activeStage?.prompt_run_id || !activeStage.prompt_text) return;
    clearSignaled(activeStage.prompt_run_id);
    setOpenedChatGptFor(null);
    startTransition(async () => {
      const armed = await armExtensionForPromptRun(activeStage.prompt_run_id!, {
        pipeline_run_id: pipeline.id,
        kind: activeStage.id,
        prompt_text: activeStage.prompt_text!,
        chatgpt_url: activeStage.chatgpt_url || "https://chatgpt.com/",
      });
      if (!armed.ok) {
        setError(armed.error);
        return;
      }
      markSignaled(activeStage.prompt_run_id!);
      setOpenedChatGptFor(activeStage.prompt_run_id!);
      const woke = await publishSignal(
        {
          prompt_run_id: activeStage.prompt_run_id,
          pipeline_run_id: pipeline.id,
          kind: activeStage.id,
          prompt_text: activeStage.prompt_text,
          chatgpt_url: activeStage.chatgpt_url || "https://chatgpt.com/",
        },
        { clearLock: true },
      );
      if (!woke.ok) {
        setError(woke.error ?? "Could not wake JobApp Bridge.");
        return;
      }
      setError(null);
    });
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div className="lg:col-span-7 li-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="li-section-title">
              Auto-apply progress
            </h2>
            <p className="li-meta mt-1">
              Pipeline: <span className="text-on-surface font-semibold">{pipeline.status}</span>
              {applicationStatus ? (
                <>
                  {" · Application: "}
                  <span className="text-on-surface font-semibold">
                    {APPLICATION_STATUS_LABELS[applicationStatus]}
                  </span>
                </>
              ) : null}
              {" · "}
              <Link
                href={`/applications/${pipeline.application_id}`}
                className="text-primary font-semibold hover:underline"
              >
                Open application
              </Link>
            </p>
          </div>
          <div className="text-[24px] font-semibold text-primary">{progressPct}%</div>
        </div>

        <div className="h-2 rounded-full bg-surface-container overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <ul className="divide-y divide-border-muted border border-border-muted rounded-lg overflow-hidden">
          {pipeline.stages.map((stage) => {
            const active = stage.id === pipeline.current_stage;
            return (
              <li
                key={stage.id}
                className={`flex items-start gap-3 px-3 py-2.5 ${
                  active ? "bg-info-container" : "bg-surface"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    stage.status === "failed"
                      ? "text-error"
                      : stage.status === "completed" || stage.status === "skipped"
                        ? "text-success"
                        : active
                          ? "text-status-waiting"
                          : "text-on-surface-variant"
                  } ${active && (stage.status === "running" || stage.status === "awaiting_chatgpt") ? "animate-spin" : ""}`}
                >
                  {stageIcon(stage.status)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-on-surface">
                    {stage.label}
                  </div>
                  <div className="text-[12px] text-on-surface-variant">
                    {stage.detail || stage.error || stage.status}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="lg:col-span-5 flex flex-col gap-3">
      {/* Full setup card only when a brand-new token must be pasted into Options. */}
      {bridgeToken && (
        <div className="li-card-flat border-l-4 border-l-primary bg-info-container p-4 space-y-3">
          <h3 className="li-section-title">
            Connect JobApp Bridge (required for ChatGPT)
          </h3>
          <ol className="list-decimal pl-5 text-[13px] text-on-surface-variant space-y-1">
            <li>
              Chrome → <code className="text-[12px]">chrome://extensions</code> → Developer
              mode → Load unpacked → select the <code className="text-[12px]">extension/</code>{" "}
              folder in this project.
            </li>
            <li>Open the extension Options page.</li>
            <li>
              App URL: <code className="text-[12px]">http://localhost:3000</code>
            </li>
            <li>
              Paste this token (shown once):
              <code className="block mt-2 text-[11px] break-all bg-surface-container-highest p-2 rounded">
                {bridgeToken}
              </code>
              <button
                type="button"
                className="text-[12px] text-primary underline mt-1"
                onClick={() => navigator.clipboard.writeText(bridgeToken)}
              >
                Copy token
              </button>
            </li>
            <li>Save options, then reload this page. The pipeline will continue automatically.</li>
          </ol>
        </div>
      )}

      {pipeline.status === "queued" && (
        <div className="li-card p-4 space-y-2">
          <h3 className="text-[16px] font-medium text-on-surface">Queued</h3>
          <p className="text-[13px] text-on-surface-variant">
            Another application is running first. This one starts automatically
            when that finishes — you can navigate away.
          </p>
        </div>
      )}

      {/* Compact bridge status — not an error banner. */}
      {pipeline.status === "awaiting_chatgpt" && (
        <p className="text-[12px] text-on-surface-variant px-1">
          JobApp Bridge on this tab:{" "}
          {bridgeDetected == null
            ? "checking…"
            : bridgeDetected
              ? "connected"
              : "not injected — hard-refresh this tab after reloading the extension"}
          {bridgeConfigured ? " · token ready" : ""}
          {" · "}
          <Link href="/settings" className="text-primary hover:underline">
            Privacy &amp; Settings
          </Link>
        </p>
      )}

      {pipeline.status === "awaiting_chatgpt" && (
        <div className="li-card p-4 space-y-3">
          <h3 className="text-[16px] font-medium text-on-surface">
            {isGoogleReconnectError(activeStage?.error || pipeline.error || error)
              ? "Google reconnect required"
              : "Waiting on JobApp Bridge"}
            {activeStage ? ` — ${activeStage.label}` : ""}
          </h3>
          {isGoogleReconnectError(activeStage?.error || pipeline.error || error) ? (
            <>
              <p className="text-[13px] text-on-surface-variant">
                ChatGPT already produced this stage&apos;s content, but Drive export
                failed because Google is disconnected or revoked. Reconnect Google,
                then this page will retry the export and continue automatically —
                no need to re-run ChatGPT.
              </p>
              <a href="/api/auth/google/start" className="li-btn-primary text-[12px] no-underline inline-flex">
                Reconnect Google
              </a>
              <p className="text-[12px] text-on-surface-variant">
                After reconnecting, keep this pipeline tab open — export recovery
                runs on the next refresh/advance tick.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-on-surface-variant">
                ChatGPT runs this stage (including JD parsing). You can leave this
                page — JobApp OS keeps the pipeline moving from any screen and
                wakes JobApp Bridge automatically.
              </p>
              <button
                type="button"
                onClick={() => wakeExtensionForCurrentStage()}
                className="li-btn-primary text-[12px]"
              >
                Open ChatGPT for this stage
              </button>
              {bridgeDetected === false && (
                <p className="text-[12px] text-on-surface-variant">
                  If ChatGPT did not open: reload JobApp Bridge in{" "}
                  <code className="text-[11px]">chrome://extensions</code>, then
                  hard-refresh this tab (Ctrl+Shift+R) and click the button again.
                </p>
              )}
            </>
          )}
          {(activeStage?.error || pipeline.error) && (
            <p className="text-[12px] text-error">
              {activeStage?.error || pipeline.error}
            </p>
          )}
        </div>
      )}

      {error &&
        !/No pending extension run to arm/i.test(error) &&
        !(bridgeDetected === false && /Bridge not detected|not detected on this page/i.test(error)) && (
        <div className="rounded-xl bg-error-container text-on-error-container p-4 space-y-3">
          <p className="text-[13px]">{error}</p>
          {pipeline.status === "failed" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await retryFailedPipeline(pipeline.id);
                  if (result.pipeline) setPipeline(result.pipeline);
                  setError(null);
                })
              }
              className="rounded-full bg-on-error-container text-error-container px-4 py-1.5 text-[12px]"
            >
              Retry failed stage
            </button>
          )}
        </div>
      )}

      {(downloads.resume_version != null ||
        downloads.cover_letter_version != null) && (
        <div className="li-card p-4 space-y-3">
          <h3 className="li-section-title">Download PDFs</h3>
          <p className="li-meta">
            Save files locally as soon as Drive export finishes for each stage.
          </p>
          <div className="flex flex-wrap gap-2">
            {downloads.resume_version != null && (
              <a
                href={`/api/applications/${pipeline.application_id}/resume/${downloads.resume_version}/pdf`}
                className="li-btn-primary text-[12px] no-underline"
              >
                Download resume PDF
              </a>
            )}
            {downloads.cover_letter_version != null && (
              <a
                href={`/api/applications/${pipeline.application_id}/cover-letter/${downloads.cover_letter_version}/pdf`}
                className="li-btn-primary text-[12px] no-underline"
              >
                Download cover letter PDF
              </a>
            )}
          </div>
        </div>
      )}

      {pipeline.status === "completed" && (
        <div className="li-card-flat border-l-4 border-l-success bg-success-container p-4">
          <h3 className="text-[16px] font-medium text-on-surface">All done</h3>
          <p className="text-[13px] text-on-surface-variant mt-1">
            Resume, cover letter, and Gmail drafts are ready. Review and send from the
            application workspace.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {downloads.resume_version != null && (
              <a
                href={`/api/applications/${pipeline.application_id}/resume/${downloads.resume_version}/pdf`}
                className="li-btn-ghost text-[12px] no-underline border border-border-hairline"
              >
                Download resume
              </a>
            )}
            {downloads.cover_letter_version != null && (
              <a
                href={`/api/applications/${pipeline.application_id}/cover-letter/${downloads.cover_letter_version}/pdf`}
                className="li-btn-ghost text-[12px] no-underline border border-border-hairline"
              >
                Download cover letter
              </a>
            )}
            <Link
              href={`/applications/${pipeline.application_id}`}
              className="li-btn-primary text-[13px] no-underline"
            >
              Open application
            </Link>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
