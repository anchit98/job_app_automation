"use client";

import { useEffect, useRef } from "react";
import { tickGlobalPipelines } from "@/app/actions/pipeline";
import { armExtensionForPromptRun } from "@/app/actions/extension";

type WakeSignal = {
  prompt_run_id: string;
  pipeline_run_id: string;
  kind: string;
  prompt_text: string;
  chatgpt_url: string;
};

/**
 * Keeps Quick Apply pipelines moving on every app page — not only /pipeline/[id].
 * Advances stuck stages, promotes the queue, and wakes JobApp Bridge for ChatGPT.
 */
export function PipelineKeeper() {
  const lastWakeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function wakeBridge(signal: WakeSignal, force: boolean) {
      const key = signal.prompt_run_id;
      if (!force && lastWakeRef.current === key) return;
      lastWakeRef.current = key;

      await armExtensionForPromptRun(signal.prompt_run_id, {
        pipeline_run_id: signal.pipeline_run_id,
        kind: signal.kind,
        prompt_text: signal.prompt_text,
        chatgpt_url: signal.chatgpt_url,
      });

      const payload = {
        ...signal,
        ts: Date.now(),
        force,
      };

      try {
        localStorage.setItem(
          "jobapp_pending_prompt_run",
          JSON.stringify(payload),
        );
      } catch {
        /* ignore */
      }

      const bridge = (
        window as unknown as {
          __JOBAPP_BRIDGE__?: {
            wake: (s: unknown) => Promise<unknown>;
          };
        }
      ).__JOBAPP_BRIDGE__;

      if (bridge?.wake) {
        try {
          await bridge.wake(payload);
          return;
        } catch {
          /* fall through to event */
        }
      }
      window.dispatchEvent(
        new CustomEvent("jobapp-pending", { detail: payload }),
      );
    }

    async function tick() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await tickGlobalPipelines();
        if (cancelled || !result.ok || !result.wake) return;
        const force = lastWakeRef.current !== result.wake.prompt_run_id;
        await wakeBridge(result.wake, force);
      } catch (err) {
        console.warn("[PipelineKeeper] tick failed", err);
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const id = setInterval(tick, 4000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
