"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  advancePipeline,
  resumePipeline,
} from "@/app/actions/pipeline";
import { ensureExtensionToken, armExtensionForPromptRun } from "@/app/actions/extension";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/status";
import type { PipelineRunRecord, PipelineStage } from "@/lib/pipeline/types";
import { getPipelineLlmEngine } from "@/lib/pipeline/types";

function isGoogleReconnectError(message?: string | null): boolean {
  if (!message) return false;
  return /google|drive export|token revoked|not connected|reconnect google/i.test(
    message,
  );
}

/** Short, plain-language status/error text for tech and non-tech users. */
function friendlyMessage(raw: string | null | undefined): string {
  if (!raw) return "Something went wrong. Please retry.";
  const msg = raw.trim();
  if (!msg) return "Something went wrong. Please retry.";

  // Progress / success details (not failures)
  if (/^generating with (gemma|llama|gpt)/i.test(msg)) return "Writing…";
  if (/fixing ai reply|schema repair|retry after error|trying again/i.test(msg)) {
    return "Trying again…";
  }
  if (/gemma ok|openai ok|ai response accepted|drive export ready/i.test(msg)) {
    return "Done";
  }
  if (/more email batches/i.test(msg)) return "Writing more emails…";
  if (/no new drafts/i.test(msg)) return "Nothing new to draft";
  if (/creating gmail drafts/i.test(msg)) return "Creating Gmail drafts…";
  if (/uploading resume pdf/i.test(msg)) return "Uploading resume PDF to Drive…";
  if (/uploading cover letter pdf/i.test(msg)) {
    return "Uploading cover letter PDF to Drive…";
  }
  if (/waiting for (resume|cover letter) pdf|waiting for drive pdfs/i.test(msg)) {
    return "Waiting for Drive PDFs…";
  }
  if (/saved \d+ contact|contacts saved/i.test(msg)) return "Contacts saved";
  if (/created \d+ draft/i.test(msg)) return "Drafts created";
  if (/skipped/i.test(msg)) return "Skipped";
  if (/retrying after interrupted|resumed by user/i.test(msg)) {
    return "Starting again…";
  }
  if (/^waiting/i.test(msg)) return "Waiting…";
  if (/^working/i.test(msg) || /^running/i.test(msg)) return "Working…";

  // Failures
  if (/master resume/i.test(msg)) {
    if (/not synced/i.test(msg)) {
      return "Master resume isn’t synced yet. Sync it on Profile, then retry.";
    }
    if (/layout map missing/i.test(msg)) {
      return "Master resume layout is missing. Re-sync from Google Doc, then retry.";
    }
    if (/invalid/i.test(msg)) {
      return "Master resume needs a re-sync from Google Doc, then retry.";
    }
    return msg.length <= 120 ? msg : "Master resume needs attention. Re-sync on Profile.";
  }
  if (
    /reconnect|invalid_grant|revoked|insufficient|not connected|drive export|failed to upload to drive|upload to drive is taking/i.test(
      msg,
    )
  ) {
    return "Google needs to be reconnected.";
  }
  if (
    /timeout|timed out|max-time|abort|aborted|ETIMEDOUT|ECONNRESET|fetch failed|network|curl/i.test(
      msg,
    )
  ) {
    return "This took too long. Please retry.";
  }
  if (/rate limit|429|quota|too many|busy/i.test(msg)) {
    return "The service is busy. Retry in a minute.";
  }
  if (
    /schema|JSON|parse|invalid response|unusable|validation|zod|expected/i.test(
      msg,
    )
  ) {
    return "The AI reply wasn't usable. Please retry.";
  }
  if (/interrupted|orphaned/i.test(msg)) {
    return "This step stopped early. Please retry.";
  }
  if (/api key|unauthorized|401|403|forbidden/i.test(msg)) {
    return "The AI service isn't available right now.";
  }
  if (/extension|bridge|chrome:\/\/extensions|load unpacked|__JOBAPP/i.test(msg)) {
    return "This run could not continue automatically. Start a new Apply.";
  }
  if (/not found|missing/i.test(msg)) {
    return "Something needed for this step is missing.";
  }
  if (/failed|error|exception/i.test(msg)) {
    return "This step failed. Please retry.";
  }

  // Already short and plain — keep it; otherwise fall back.
  if (msg.length <= 60 && !/[{\[\]\\]|HTTP\/|at \w+\.|node:|Error:/i.test(msg)) {
    return msg;
  }
  return "Something went wrong. Please retry.";
}

function pipelineStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_chatgpt":
      return "waiting on AI";
    case "needs_manual":
      return "needs attention";
    default:
      return status;
  }
}

function stageStatusLabel(stage: PipelineStage, isServerOpenAi: boolean): string {
  if (stage.error) return friendlyMessage(stage.error);
  if (stage.detail) return friendlyMessage(stage.detail);
  switch (stage.status) {
    case "pending":
      return "Waiting…";
    case "running":
      return isServerOpenAi ? "Writing…" : "Working…";
    case "awaiting_chatgpt":
      return "Waiting on AI…";
    case "completed":
      return "Done";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    default:
      return "Waiting…";
  }
}

function parsePipelineTimestamp(value: string): number | null {
  if (!value) return null;
  // DB returns "2026-07-30 11:20:57.583459" in UTC without a zone marker.
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
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
    // Manual "Open AI" must be allowed to take over a stuck tab.
    force: Boolean(opts?.clearLock),
  };
  try {
    localStorage.setItem("jobapp_pending_prompt_run", JSON.stringify(payload));
  } catch {
    /* ignore */
  }

  // Wake only via bridge.wake() - do NOT also fire jobapp-pending (that double-starts
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

  // Manual retry only - periodic re-arms must not kill an in-flight AI tab.
  if (opts?.clearLock) {
    try {
      await bridge?.clearLock?.();
    } catch {
      /* ignore */
    }
  }

  if (!bridge?.wake) {
    window.dispatchEvent(new CustomEvent("jobapp-pending", { detail: payload }));
    return {
      ok: false,
      error:
        "This run could not continue automatically. Start a new Apply from /apply.",
    };
  }

  try {
    const res = await bridge.wake(payload);
    if (res?.ok === false || res?.opened === false) {
      const detail =
        res?.error ||
        res?.reason ||
        "AI could not start for this stage.";
      return {
        ok: false,
        error: /token/i.test(detail)
          ? "This run could not continue automatically. Start a new Apply from /apply."
          : detail,
        reason: res?.reason,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not start AI for this stage.",
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
  const pipelineRef = useRef(pipeline);
  pipelineRef.current = pipeline;
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

  const isServerOpenAi = useMemo(
    () => getPipelineLlmEngine(pipeline) === "openai",
    [pipeline],
  );

  // Weighted progress: in-flight stages count half so the bar keeps moving
  // instead of jumping only on stage completion.
  const progressPct = useMemo(() => {
    const total = Math.max(pipeline.stages.length, 1);
    let done = 0;
    for (const s of pipeline.stages) {
      if (s.status === "completed" || s.status === "skipped") done += 1;
      else if (s.status === "running" || s.status === "awaiting_chatgpt") {
        done += 0.5;
      }
    }
    return Math.min(100, Math.round((done / total) * 100));
  }, [pipeline.stages]);

  const isLive = pipelineStillActive(pipeline);

  // 1s ticker so the elapsed clock and animations feel alive between polls.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  const startedTs = useMemo(
    () => parsePipelineTimestamp(pipeline.created_at),
    [pipeline.created_at],
  );
  const endTs = useMemo(
    () =>
      isLive ? null : parsePipelineTimestamp(pipeline.updated_at),
    [isLive, pipeline.updated_at],
  );
  const elapsedLabel =
    startedTs != null
      ? formatElapsed((endTs ?? nowTs) - startedTs)
      : null;

  const updatedTs = useMemo(
    () => parsePipelineTimestamp(pipeline.updated_at),
    [pipeline.updated_at],
  );
  const secondsSinceUpdate =
    updatedTs != null ? Math.max(0, Math.floor((nowTs - updatedTs) / 1000)) : 0;

  const showRetry =
    pipeline.status !== "completed" &&
    (pipeline.status === "failed" ||
      pipeline.status === "needs_manual" ||
      pipeline.status === "queued" ||
      Boolean(pipeline.error) ||
      Boolean(error) ||
      pipeline.stages.some((s) => s.status === "failed") ||
      // Looks stuck: no progress update for 90s+ while still live
      (isLive && secondsSinceUpdate >= 90));

  function handleRetry() {
    startTransition(async () => {
      setError(null);
      const result = await resumePipeline(pipeline.id);
      if (result.pipeline) setPipeline(result.pipeline);
      if (!result.ok) {
        setError(result.error ?? "Retry failed.");
      } else if ("warning" in result && result.warning) {
        setError(result.warning);
      }
    });
  }

  /** Parallel HTTP poll — not blocked by long-running advancePipeline server actions. */
  const statusInFlight = useRef(false);
  const refreshLive = useCallback(async () => {
    if (statusInFlight.current) return null;
    statusInFlight.current = true;
    try {
      const res = await fetch(`/api/pipeline/${pipeline.id}/status`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return null;
      const status = (await res.json()) as {
        ok: boolean;
        pipeline?: PipelineRunRecord;
        application_status?: ApplicationStatus | null;
        downloads?: {
          resume_version: number | null;
          cover_letter_version: number | null;
        };
      };
      if (!status.ok || !status.pipeline) return null;
      setPipeline(status.pipeline);
      if (status.application_status) {
        setApplicationStatus(status.application_status);
      }
      if (status.downloads) {
        setDownloads(status.downloads);
      }
      return status;
    } catch {
      return null;
    } finally {
      statusInFlight.current = false;
    }
  }, [pipeline.id]);

  const advanceInFlight = useRef(false);
  const tick = useCallback(async () => {
    if (advanceInFlight.current) {
      return { ok: true as const, skipped: true as const };
    }
    advanceInFlight.current = true;
    try {
      const advanced = await advancePipeline(pipeline.id);
      if (advanced.pipeline) setPipeline(advanced.pipeline);
      // Refresh via HTTP so icons catch any stages that finished mid-flight.
      await refreshLive();
      if (!advanced.ok && !("skipped" in advanced && advanced.skipped)) {
        setError(advanced.error ?? "Pipeline error");
      } else if (advanced.ok) {
        setError(null);
      }
      return advanced;
    } finally {
      advanceInFlight.current = false;
    }
  }, [pipeline.id, refreshLive]);

  // Ensure extension token exists (auto-create on first use).
  useEffect(() => {
    if (isServerOpenAi) return;
    void (async () => {
      const result = await ensureExtensionToken();
      setBridgeConfigured(result.configured);
      if (result.created && result.token) {
        setBridgeToken(result.token);
      }
    })();
  }, [isServerOpenAi]);

  // Detect injected helper script on this origin (legacy path only).
  useEffect(() => {
    if (isServerOpenAi) return;
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
    let statusInterval: ReturnType<typeof setInterval> | null = null;
    let advanceInterval: ReturnType<typeof setInterval> | null = null;

    const stopIfSettled = (p: PipelineRunRecord) => {
      if (
        stagesSettled(p) &&
        (p.status === "completed" ||
          p.status === "failed" ||
          p.status === "needs_manual")
      ) {
        if (statusInterval) clearInterval(statusInterval);
        if (advanceInterval) clearInterval(advanceInterval);
        statusInterval = null;
        advanceInterval = null;
        return true;
      }
      return false;
    };

    void (async () => {
      if (pipelineStillActive(pipeline)) {
        await tick();
      }
    })();

    // Status poll — coalesced + slower so we don't flood Supabase (was 1s → 3–35s each).
    statusInterval = setInterval(async () => {
      if (cancelled) return;
      const latest = await refreshLive();
      if (latest?.pipeline) stopIfSettled(latest.pipeline);
    }, 2500);

    // Drive the pipeline forward. While an AI stage is live, status poll alone is enough.
    advanceInterval = setInterval(async () => {
      if (cancelled || pending || advanceInFlight.current) return;

      let latestPipeline = pipelineRef.current;
      const liveAi = latestPipeline.stages.find(
        (s) =>
          (s.status === "running" || s.status === "awaiting_chatgpt") &&
          (s.id === "jd_parse" ||
            s.id === "resume" ||
            s.id === "cover_letter" ||
            s.id === "cold_email"),
      );
      if (getPipelineLlmEngine(latestPipeline) === "openai" && liveAi) {
        return;
      }

      if (
        stagesSettled(latestPipeline) &&
        (latestPipeline.status === "completed" ||
          latestPipeline.status === "failed" ||
          latestPipeline.status === "needs_manual")
      ) {
        return;
      }

      if (!pipelineStillActive(latestPipeline)) {
        const refreshed = await refreshLive();
        if (!refreshed?.pipeline || cancelled) return;
        latestPipeline = refreshed.pipeline;
        if (stopIfSettled(latestPipeline)) return;
        if (!pipelineStillActive(latestPipeline)) return;
        const liveAfter = latestPipeline.stages.find(
          (s) =>
            (s.status === "running" || s.status === "awaiting_chatgpt") &&
            (s.id === "jd_parse" ||
              s.id === "resume" ||
              s.id === "cover_letter" ||
              s.id === "cold_email"),
        );
        if (getPipelineLlmEngine(latestPipeline) === "openai" && liveAfter) {
          return;
        }
      }

      await tick();
    }, 2000);

    return () => {
      cancelled = true;
      if (statusInterval) clearInterval(statusInterval);
      if (advanceInterval) clearInterval(advanceInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid restarting on every stages_json patch
  }, [pipeline.status, pending, refreshLive, tick]);

  // Keep waking AI while this stage is waiting (JD parse, resume, etc.).
  // First signal can be missed if the extension wasn't ready; re-arm periodically.
  // Skip auto-wake when Drive export is blocked on Google reconnect.
  useEffect(() => {
    if (isServerOpenAi) return;
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
        // AI on first arm or manual force (interval must not abort paste).
        const armed = await armExtensionForPromptRun(promptRunId, {
          pipeline_run_id: pipeline.id,
          kind: activeStage!.id,
          prompt_text: activeStage!.prompt_text!,
          chatgpt_url: activeStage!.chatgpt_url || "https://chatgpt.com/",
        });
        if (cancelled) return;
        if (!armed.ok) {
          // Soft warn only - do not paint a hard error while the stage is still recoverable.
          console.warn("[pipeline] arm failed", armed.error);
          return;
        }
        if (already && !opts?.forceSignal) {
          return;
        }
        // Retry briefly - race between arm commit and extension consume.
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
          // Bridge missing on this tab is common after SPA nav - keep muted, allow manual open.
          if (
            /bridge|extension|not detected|__JOBAPP/i.test(woke.error || "") ||
            woke.reason === "no_bridge"
          ) {
            return;
          }
          setError(woke.error ?? "Could not start AI for this stage.");
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
    // Keep wake_until fresh; do not re-open/reinject AI every tick.
    const interval = setInterval(() => {
      void wakeExtension({ forceSignal: false });
    }, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    isServerOpenAi,
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
        setError(woke.error ?? "Could not start AI for this stage.");
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
              {isServerOpenAi && (
                <span className="ml-2 inline-flex items-center rounded-full bg-info-container px-2 py-0.5 text-[11px] font-semibold text-primary align-middle">
                  AI
                </span>
              )}
            </h2>
            <p className="li-meta mt-1">
              Pipeline:{" "}
              <span className="text-on-surface font-semibold">
                {pipelineStatusLabel(pipeline.status)}
              </span>
              {applicationStatus ? (
                <>
                  {" · Application: "}
                  <span className="text-on-surface font-semibold">
                    {APPLICATION_STATUS_LABELS[applicationStatus]}
                  </span>
                </>
              ) : null}
              {elapsedLabel ? (
                <>
                  {" · "}
                  <span className="pp-elapsed text-on-surface font-semibold">
                    {isLive ? "Elapsed " : "Took "}
                    {elapsedLabel}
                  </span>
                </>
              ) : null}
              {" · "}
              <Link
                href={`/applications/${pipeline.application_id}`}
                prefetch={false}
                className="text-primary font-semibold hover:underline"
              >
                Open application
              </Link>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="pp-percent text-[24px] font-semibold text-primary">
              {progressPct}%
            </div>
            {showRetry && (
              <button
                type="button"
                disabled={pending}
                onClick={handleRetry}
                className="li-btn-secondary text-[12px] disabled:opacity-50"
              >
                {pending ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        </div>

        <div className="pp-progressbar">
          <div
            className={`pp-progressbar-fill ${isLive ? "pp-progressbar-live" : ""}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <ol className="space-y-0">
          {pipeline.stages.map((stage, idx) => {
            const active =
              stage.id === pipeline.current_stage ||
              stage.status === "running" ||
              stage.status === "awaiting_chatgpt";
            const done =
              stage.status === "completed" || stage.status === "skipped";
            const failed = stage.status === "failed";
            const inFlight =
              stage.status === "running" || stage.status === "awaiting_chatgpt";
            const isLast = idx === pipeline.stages.length - 1;
            const nodeClass = failed
              ? "pp-node-failed"
              : stage.status === "skipped"
                ? "pp-node-skipped"
                : stage.status === "completed"
                  ? "pp-node-done"
                  : inFlight || active
                    ? "pp-node-active"
                    : "";
            return (
              <li
                key={stage.id}
                className="pp-row relative flex gap-3 pb-4 last:pb-0"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {!isLast && (
                  <span
                    className={`pp-connector ${done ? "pp-connector-done" : ""}`}
                    aria-hidden
                  />
                )}
                <div className={`pp-node ${nodeClass}`}>
                  {inFlight ? (
                    <span className="pp-spinner" aria-label="In progress" />
                  ) : (
                    <span className="material-symbols-outlined text-[13px] leading-none">
                      {failed
                        ? "priority_high"
                        : stage.status === "completed"
                          ? "check"
                          : stage.status === "skipped"
                            ? "remove"
                            : "circle"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 flex min-h-[24px] flex-col justify-center">
                  <div className="flex items-center gap-2 leading-tight">
                    <span
                      className={`text-[14px] font-semibold ${
                        failed
                          ? "text-error"
                          : done || active
                            ? "text-on-surface"
                            : "text-on-surface-variant"
                      }`}
                    >
                      {stage.label}
                    </span>
                    {stage.status === "skipped" && (
                      <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10.5px] font-medium text-on-surface-variant">
                        skipped
                      </span>
                    )}
                  </div>
                  <div
                    className={`mt-0.5 truncate text-[12px] leading-snug ${
                      failed ? "text-error" : "text-on-surface-variant"
                    } ${inFlight ? "pp-detail-running" : ""}`}
                    title={stage.error || stage.detail || undefined}
                  >
                    {stageStatusLabel(stage, isServerOpenAi)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="lg:col-span-5 flex flex-col gap-3">
      {pipeline.status === "queued" && (
        <div className="li-card p-4 space-y-2">
          <h3 className="text-[16px] font-medium text-on-surface">Queued</h3>
          <p className="text-[13px] text-on-surface-variant">
            Another application is running first. This one starts automatically
            when that finishes - you can navigate away.
          </p>
        </div>
      )}

      {isServerOpenAi &&
        (pipeline.status === "running" ||
          activeStage?.status === "running") && (
        <div className="li-card p-4 space-y-2">
          <h3 className="text-[16px] font-medium text-on-surface">
            Generating with AI
            {activeStage ? ` — ${activeStage.label}` : ""}
          </h3>
          <p className="text-[13px] text-on-surface-variant">
            Everything runs automatically — keep this tab open. Each AI step
            takes about 1–2 minutes.
          </p>
          {(activeStage?.detail || activeStage?.error || pipeline.error) && (
            <p
              className={`text-[12px] ${
                activeStage?.error || pipeline.error
                  ? "text-error"
                  : "text-on-surface-variant"
              }`}
            >
              {friendlyMessage(
                activeStage?.error || pipeline.error || activeStage?.detail,
              )}
            </p>
          )}
        </div>
      )}

      {!isServerOpenAi && pipeline.status === "awaiting_chatgpt" && (
        <div className="li-card p-4 space-y-3">
          <h3 className="text-[16px] font-medium text-on-surface">
            {isGoogleReconnectError(activeStage?.error || pipeline.error || error)
              ? "Google reconnect required"
              : "Waiting on AI"}
            {activeStage ? ` - ${activeStage.label}` : ""}
          </h3>
          {isGoogleReconnectError(activeStage?.error || pipeline.error || error) ? (
            <>
              <p className="text-[13px] text-on-surface-variant">
                Google got disconnected. Reconnect it and this run continues
                automatically.
              </p>
              <a href="/api/auth/google/start" className="li-btn-primary text-[12px] no-underline inline-flex">
                Reconnect Google
              </a>
            </>
          ) : (
            <>
              <p className="text-[13px] text-on-surface-variant">
                This older run is stuck waiting. Start a fresh Apply from{" "}
                <Link href="/apply" className="text-primary font-semibold hover:underline">
                  Apply
                </Link>{" "}
                for automatic cloud generation.
              </p>
              <Link
                href="/apply"
                prefetch={false}
                className="li-btn-primary text-[12px] no-underline inline-flex"
              >
                Start Apply
              </Link>
            </>
          )}
          {(activeStage?.error || pipeline.error) && (
            <p className="text-[12px] text-error">
              {friendlyMessage(activeStage?.error || pipeline.error || "")}
            </p>
          )}
        </div>
      )}

      {error &&
        !isGoogleReconnectError(error) &&
        !/No pending extension run to arm|Bridge not detected|not detected on this page|could not continue automatically|chrome:\/\/extensions/i.test(
          error,
        ) && (
        <div className="rounded-xl bg-error-container text-on-error-container p-4">
          <p className="text-[13px]">{friendlyMessage(error)}</p>
        </div>
      )}

      {(downloads.resume_version != null ||
        downloads.cover_letter_version != null) && (
        <div className="li-card p-4 space-y-3">
          <h3 className="li-section-title">Download PDFs</h3>
          <p className="li-meta">
            Available once Drive export finishes — Gmail drafts wait for these
            PDFs before attaching.
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
          <div className="mt-4">
            <Link
              href={`/applications/${pipeline.application_id}`}
              prefetch={false}
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
