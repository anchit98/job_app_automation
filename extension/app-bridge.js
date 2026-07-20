/**
 * Wakes JobApp Bridge only from explicit Quick Apply pipeline signals.
 * Prefer bridge.wake() from the pipeline page (CustomEvent alone can double-fire).
 */
const SIGNAL_KEY = "jobapp_pending_prompt_run";
const MAX_AGE_MS = 5 * 60 * 1000;

let lastNotifyKey = "";
let lastNotifyAt = 0;

function clearSignal() {
  try {
    localStorage.removeItem(SIGNAL_KEY);
  } catch {
    /* ignore */
  }
}

function isFresh(signal) {
  if (!signal?.prompt_run_id || !signal?.prompt_text) return false;
  const ts = Number(signal.ts);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= MAX_AGE_MS;
}

function notify(signal, done) {
  if (!isFresh(signal)) {
    done?.({ ok: false, error: "stale_signal" });
    return;
  }

  // Dedupe burst wakes (CustomEvent + wake, or React Strict Mode double mount).
  const key = `${signal.prompt_run_id}:${signal.force ? "1" : "0"}`;
  const now = Date.now();
  if (key === lastNotifyKey && now - lastNotifyAt < 2500 && !signal.force) {
    done?.({ ok: true, reason: "deduped" });
    return;
  }
  lastNotifyKey = key;
  lastNotifyAt = now;

  chrome.runtime.sendMessage(
    {
      type: "JOBAPP_LOCAL_SIGNAL",
      payload: signal,
      force: Boolean(signal.force),
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[JobApp Bridge] background not reachable:",
          chrome.runtime.lastError.message,
        );
        done?.({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (response && response.ok === false) {
        console.warn("[JobApp Bridge]", response.reason || response.error);
        done?.(response);
        return;
      }
      clearSignal();
      done?.(response || { ok: true });
    },
  );
}

clearSignal();

window.dispatchEvent(new CustomEvent("jobapp-bridge-ready", { detail: { version: "1.3.16" } }));

window.addEventListener("jobapp-pending", (e) => {
  notify(e.detail);
});

window.addEventListener("jobapp-clear-pending", () => {
  clearSignal();
  chrome.runtime.sendMessage({ type: "JOBAPP_CLEAR_LOCK" }, () => {
    void chrome.runtime.lastError;
  });
});

window.__JOBAPP_BRIDGE__ = {
  version: "1.3.16",
  ping: () =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "JOBAPP_PING" }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false });
        else resolve(res || { ok: false });
      });
    }),
  wake: (signal) =>
    new Promise((resolve) => {
      notify({ ...signal, ts: signal?.ts || Date.now() }, resolve);
    }),
  clearLock: () =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "JOBAPP_CLEAR_LOCK" }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false });
        else resolve(res || { ok: true });
      });
    }),
};
