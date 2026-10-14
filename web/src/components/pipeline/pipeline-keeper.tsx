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

const BUSY_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 60000;
/**
 * Cadence while the tab is in the background.
 *
 * A hidden tab used to skip its ticks entirely, which meant a pipeline stopped
 * the moment the user switched to another window — the one time they most
 * expect it to keep running. It keeps ticking now, just slowly enough that a
 * forgotten background tab is not hammering the database.
 */
const HIDDEN_INTERVAL_MS = 15000;
/** Let the page's own data queries win the DB pool before the first tick. */
const FIRST_TICK_DELAY_MS = 1500;

/**
 * Keeps Quick Apply pipelines moving on every app page - not only /pipeline/[id].
 * Backs off when idle or backgrounded so UI clicks stay snappy.
 */
export function PipelineKeeper() {
  const lastWakeRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

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

    function schedule(ms: number) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => void tick(), ms);
    }

    function intervalFor(busy: boolean) {
      if (!busy) return IDLE_INTERVAL_MS;
      const hidden = typeof document !== "undefined" && document.hidden;
      return hidden ? HIDDEN_INTERVAL_MS : BUSY_INTERVAL_MS;
    }

    async function tick() {
      if (cancelled || inFlight) return;

      inFlight = true;
      try {
        const result = await tickGlobalPipelines();
        if (cancelled || !result.ok) return;

        const busy = (result.busy_count ?? 0) > 0 || Boolean(result.wake);
        busyRef.current = busy;
        schedule(intervalFor(busy));

        // Waking the AI tab needs a foreground tab to open it in; the pipeline
        // itself has already been advanced above either way.
        if (!result.wake) return;
        if (typeof document !== "undefined" && document.hidden) return;
        const force = lastWakeRef.current !== result.wake.prompt_run_id;
        await wakeBridge(result.wake, force);
      } catch (err) {
        console.warn("[PipelineKeeper] tick failed", err);
      } finally {
        inFlight = false;
      }
    }

    const firstTick = setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
    schedule(IDLE_INTERVAL_MS);

    const onFocus = () => {
      if (!document.hidden) void tick();
    };
    const onVisibility = () => {
      // Re-pace immediately: coming back to the foreground should feel live.
      schedule(intervalFor(busyRef.current));
      if (!document.hidden) void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(firstTick);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
