"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  getFollowUpDraftStatus,
  manualSendFollowUp,
  runFollowUpNow,
} from "@/app/actions/follow-ups";
import { armExtensionForPromptRun } from "@/app/actions/extension";

type Phase =
  | "idle"
  | "preparing"
  | "waiting_chatgpt"
  | "creating_draft"
  | "done";

type BridgeApi = {
  wake?: (s: Record<string, unknown>) => Promise<{
    ok?: boolean;
    error?: string;
    reason?: string;
    opened?: boolean;
  }>;
  clearLock?: () => Promise<unknown>;
};

function getBridge(): BridgeApi | undefined {
  return (
    window as unknown as { __JOBAPP_BRIDGE__?: BridgeApi }
  ).__JOBAPP_BRIDGE__;
}

async function waitForBridge(timeoutMs = 3000): Promise<BridgeApi | null> {
  const existing = getBridge();
  if (existing?.wake) return existing;

  return new Promise((resolve) => {
    let done = false;
    const finish = (api: BridgeApi | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("jobapp-bridge-ready", onReady);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(api);
    };
    const onReady = () => finish(getBridge() ?? null);
    window.addEventListener("jobapp-bridge-ready", onReady);
    const poll = setInterval(() => {
      const api = getBridge();
      if (api?.wake) finish(api);
    }, 200);
    const timer = setTimeout(() => finish(getBridge() ?? null), timeoutMs);
  });
}

/**
 * Open AI exactly once for this prompt run.
 * Never force-retry: force re-opens tabs. Fall back to a single CustomEvent.
 */
async function wakeBridgeOnce(signal: {
  prompt_run_id: string;
  kind: string;
  prompt_text: string;
  chatgpt_url?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const payload = { ...signal, ts: Date.now(), force: true };
  try {
    localStorage.setItem("jobapp_pending_prompt_run", JSON.stringify(payload));
  } catch {
    /* ignore */
  }

  const bridge = (await waitForBridge(3000)) ?? getBridge();

  if (bridge?.wake) {
    try {
      const res = await bridge.wake(payload);
      if (res?.ok === false || res?.opened === false) {
        return {
          ok: false,
          error: res?.error || res?.reason || "Could not start AI.",
        };
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not start AI.",
      };
    }
  }

  window.dispatchEvent(new CustomEvent("jobapp-pending", { detail: payload }));
  return { ok: true };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function ApplicationFollowUpButton({
  dueFollowUp,
}: {
  dueFollowUp: {
    id: string;
    sequence: 1 | 2;
    due_at: string;
    contact_name: string | null;
  } | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contactCount, setContactCount] = useState(1);
  const runningRef = useRef(false);

  const due = Boolean(dueFollowUp);
  const busy = phase !== "idle" && phase !== "done";

  async function finishWithGmailDrafts(followUpId: string) {
    setPhase("creating_draft");
    const sent = await manualSendFollowUp(followUpId);
    if (!sent.ok) {
      setError(sent.error);
      setPhase("idle");
      runningRef.current = false;
      return;
    }
    if (sent.gmail_url) {
      window.open(sent.gmail_url, "_blank", "noopener,noreferrer");
    }
    const n = sent.draft_count ?? 1;
    setSuccess(n > 1 ? `${n} Gmail drafts ready` : "Gmail draft ready");
    setPhase("done");
    router.refresh();
    runningRef.current = false;
    setTimeout(() => {
      setPhase("idle");
      setSuccess(null);
    }, 4000);
  }

  /** Poll only - never wake AI again. One AI reply fans out to all contacts. */
  async function waitForGeneratedDrafts(followUpId: string) {
    setPhase("waiting_chatgpt");
    const deadline = Date.now() + 4 * 60 * 1000;

    while (Date.now() < deadline) {
      const status = await getFollowUpDraftStatus(followUpId);
      if (!status.ok) {
        setError(status.error);
        setPhase("idle");
        runningRef.current = false;
        return;
      }
      if (status.contact_count > 1) {
        setContactCount(status.contact_count);
      }

      if (status.all_gmail_ready) {
        setSuccess(
          status.contact_count > 1
            ? `${status.contact_count} Gmail drafts ready`
            : "Gmail draft ready",
        );
        setPhase("done");
        router.refresh();
        runningRef.current = false;
        setTimeout(() => {
          setPhase("idle");
          setSuccess(null);
        }, 4000);
        return;
      }

      if (status.all_drafts_ready || status.drafts_ready > 0) {
        // Fan-out drafts exist (same body, per-contact greetings) → Gmail once.
        if (status.all_drafts_ready) {
          await finishWithGmailDrafts(followUpId);
          return;
        }
      }

      if (status.prompt_status === "abandoned") {
        setError("Follow-up prompt was abandoned. Try again.");
        setPhase("idle");
        runningRef.current = false;
        return;
      }

      if (status.prompt_status === "completed" && status.drafts_ready === 0) {
        setError("AI finished but no drafts were created. Try again.");
        setPhase("idle");
        runningRef.current = false;
        return;
      }

      await sleep(1200);
    }

    setError("Timed out waiting for AI. Try again.");
    setPhase("idle");
    runningRef.current = false;
  }

  async function run(force = false) {
    if (!dueFollowUp || runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setSuccess(null);
    setContactCount(1);
    setPhase("preparing");

    try {
      const result = await runFollowUpNow(dueFollowUp.id, { force });
      if (!result.ok) {
        if (result.needs_confirmation && !force) {
          setPhase("idle");
          runningRef.current = false;
          const ok = window.confirm(
            `${result.error}\n\nPrepare this follow-up anyway?`,
          );
          if (ok) void run(true);
          return;
        }
        setError(result.error);
        setPhase("idle");
        runningRef.current = false;
        return;
      }

      if (result.contact_count > 1) {
        setContactCount(result.contact_count);
      }

      const existing = await getFollowUpDraftStatus(dueFollowUp.id);
      if (existing.ok && existing.all_drafts_ready) {
        await finishWithGmailDrafts(dueFollowUp.id);
        return;
      }

      // Arm once, then open AI once. Reply is reused for every contact.
      const armed = await armExtensionForPromptRun(result.prompt_run_id, {
        kind: "follow_up",
        prompt_text: result.prompt_text,
        chatgpt_url: "https://chatgpt.com/",
      });
      if (!armed.ok) {
        setError(armed.error ?? "Could not start AI for this follow-up.");
        setPhase("idle");
        runningRef.current = false;
        return;
      }

      const woke = await wakeBridgeOnce({
        prompt_run_id: result.prompt_run_id,
        kind: "follow_up",
        prompt_text: result.prompt_text,
        chatgpt_url: "https://chatgpt.com/",
      });
      if (!woke.ok) {
        setError(woke.error ?? "Could not open AI for this follow-up.");
        setPhase("idle");
        runningRef.current = false;
        return;
      }

      await waitForGeneratedDrafts(dueFollowUp.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Follow-up failed.");
      setPhase("idle");
      runningRef.current = false;
    }
  }

  const phaseLabel =
    phase === "preparing"
      ? "Preparing…"
      : phase === "waiting_chatgpt"
        ? contactCount > 1
          ? `AI → ${contactCount} drafts…`
          : "Waiting for AI…"
        : phase === "creating_draft"
          ? contactCount > 1
            ? `Saving ${contactCount} drafts…`
            : "Creating draft…"
          : phase === "done"
            ? "Done"
            : dueFollowUp?.contact_name
              ? `Follow up (#${dueFollowUp.sequence})`
              : due
                ? `Follow up (#${dueFollowUp?.sequence ?? 1})`
                : "Follow up";

  const title = due
    ? "One AI run; same body for all contacts (greeting only changes)"
    : "No follow-up is due yet";

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        title={title}
        disabled={!due || busy}
        onClick={() => void run(false)}
        className="inline-flex items-center gap-1 rounded-md border border-border-hairline px-2 py-1.5 text-[12px] font-semibold text-primary hover:bg-[var(--secondary-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span
          className={`material-symbols-outlined text-[16px] ${
            busy ? "animate-spin" : ""
          }`}
        >
          {busy ? "progress_activity" : "mark_email_unread"}
        </span>
        {phaseLabel}
      </button>
      {error ? (
        <p className="max-w-[200px] text-right text-[10px] leading-tight text-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="max-w-[200px] text-right text-[10px] leading-tight text-primary">
          {success}
        </p>
      ) : null}
    </div>
  );
}
