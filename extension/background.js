const DEFAULTS = {
  appUrl: "https://job-app-automation-mu.vercel.app",
  token: "",
  enabled: true,
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function api(path, options = {}) {
  const { appUrl, token } = await getSettings();
  if (!token) throw new Error("Extension token not configured — open Options");
  const res = await fetch(`${appUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForChatGptReady(tabId, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab.url || "";
      if (
        tab.status === "complete" &&
        /chatgpt\.com|chat\.openai\.com/i.test(url) &&
        !/\/auth|\/login/i.test(url)
      ) {
        return true;
      }
    } catch {
      return false;
    }
    await sleep(500);
  }
  return false;
}

async function injectAndRun(tabId, payload, { force = false } = {}) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "JOBAPP_RUN_PROMPT",
      payload,
      force,
    });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await sleep(800);
      await chrome.tabs.sendMessage(tabId, {
        type: "JOBAPP_RUN_PROMPT",
        payload,
        force,
      });
      return true;
    } catch (e) {
      console.warn("[JobApp Bridge] inject failed", e);
      return false;
    }
  }
}

async function getContentPhase(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "JOBAPP_GET_PHASE" });
  } catch {
    return null;
  }
}

async function tabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

async function clearSessionLock() {
  await chrome.storage.session.remove([
    "activePromptRunId",
    "activePrompt",
    "startedAt",
    "activeTabId",
    "lastInjectAt",
    "bridgeTabIds",
  ]);
}

async function rememberBridgeTab(tabId) {
  if (tabId == null) return;
  const state = await chrome.storage.session.get(["bridgeTabIds"]);
  const ids = Array.isArray(state.bridgeTabIds) ? state.bridgeTabIds : [];
  if (!ids.includes(tabId)) {
    await chrome.storage.session.set({ bridgeTabIds: [...ids, tabId] });
  }
  await chrome.storage.session.set({ activeTabId: tabId });
}

function withTimeout(promise, ms, label = "timeout") {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

let openAndRunMutex = Promise.resolve();

/**
 * Always honor an explicit pipeline signal.
 * Clears stale locks from prior stages so cold email / cover letter cannot stall.
 * Returns { opened, reason } so the web app knows whether ChatGPT actually launched.
 */
async function openAndRun(pending, { force = false } = {}) {
  const run = async () => {
    if (!pending?.prompt_run_id) {
      return { opened: false, reason: "missing_prompt_run_id" };
    }

    const state = await chrome.storage.session.get([
      "activePromptRunId",
      "activeTabId",
      "activePrompt",
      "startedAt",
      "lastInjectAt",
    ]);

    // Same run + live tab → only reinject if content is idle/stuck, not mid-paste.
    if (
      state.activePromptRunId === pending.prompt_run_id &&
      state.activeTabId != null &&
      (await tabExists(state.activeTabId))
    ) {
      const ageMs = Date.now() - Number(state.startedAt || 0);
      // After ~45s with no paste-back, close and reopen so a fresh wake can run.
      if (ageMs > 45_000) {
        console.warn(
          "[JobApp Bridge] same-run tab stale — reopening",
          pending.prompt_run_id,
          ageMs,
        );
        try {
          await chrome.tabs.remove(state.activeTabId);
        } catch {
          /* ignore */
        }
        await clearSessionLock();
      } else {
        const phase = await getContentPhase(state.activeTabId);
        const busy =
          phase?.prompt_run_id === pending.prompt_run_id &&
          (phase?.phase === "pasting" || phase?.phase === "waiting");
        if (busy && !force) {
          return { opened: true, reason: "already_running" };
        }
        const sinceInject = Date.now() - Number(state.lastInjectAt || 0);
        if (!force && sinceInject < 15_000 && phase?.phase !== "idle") {
          return { opened: true, reason: "recent_inject" };
        }
        const payload = { ...(state.activePrompt || {}), ...pending };
        await chrome.storage.session.set({
          activePrompt: payload,
          startedAt: state.startedAt || Date.now(),
          lastInjectAt: Date.now(),
        });
        const ok = await injectAndRun(state.activeTabId, payload, {
          force: Boolean(force),
        });
        return {
          opened: ok,
          reason: ok ? "reinjected" : "reinject_failed",
        };
      }
    }

    // Different run or dead tab → close leftover tab and drop lock.
    if (state.activeTabId != null) {
      try {
        await chrome.tabs.remove(state.activeTabId);
      } catch {
        /* ignore */
      }
    }
    if (state.activePromptRunId || state.activeTabId) {
      console.info(
        "[JobApp Bridge] clearing lock before new stage",
        state.activePromptRunId,
        "→",
        pending.prompt_run_id,
      );
      await clearSessionLock();
    }

    let wake;
    try {
      wake = await api("/api/extension/pending", {
        method: "POST",
        body: JSON.stringify({
          action: "consume_wake",
          prompt_run_id: pending.prompt_run_id,
        }),
      });
    } catch (e) {
      console.warn("[JobApp Bridge] wake rejected", e.message || e);
      return { opened: false, reason: e.message || "wake_rejected" };
    }
    if (!wake?.armed) {
      console.warn("[JobApp Bridge] no active wake for", pending.prompt_run_id);
      return { opened: false, reason: "not_armed" };
    }

    const payload = {
      ...pending,
      ...(wake.pending || {}),
    };

    await chrome.storage.session.set({
      activePromptRunId: payload.prompt_run_id,
      activePrompt: payload,
      startedAt: Date.now(),
      lastInjectAt: Date.now(),
    });

    try {
      await api("/api/extension/pending", {
        method: "POST",
        body: JSON.stringify({
          action: "claim",
          prompt_run_id: payload.prompt_run_id,
        }),
      });
    } catch {
      /* race ok */
    }

    const url = "https://chatgpt.com/";
    console.info("[JobApp Bridge] opening ChatGPT for", payload.kind, url);
    const tab = await chrome.tabs.create({ url, active: true });

    if (tab.id != null) {
      await rememberBridgeTab(tab.id);
    } else {
      await clearSessionLock();
      return { opened: false, reason: "tab_create_failed" };
    }

    const tryRun = async (attempt) => {
      await waitForChatGptReady(tab.id, attempt === 1 ? 20000 : 10000);
      // First inject soft; retries after failures may force if still idle.
      const ok = await injectAndRun(tab.id, payload, {
        force: attempt > 3,
      });
      if (!ok && attempt < 6) {
        setTimeout(() => tryRun(attempt + 1), 2500 * attempt);
      }
    };
    // Don't inject into a blank loading document — wait for chatgpt.com first.
    void tryRun(1);

    return { opened: true, reason: "opened" };
  };

  const next = openAndRunMutex.then(run, run);
  openAndRunMutex = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function closeActiveBridgeTab(expectedPromptRunId) {
  const state = await chrome.storage.session.get([
    "activeTabId",
    "activePromptRunId",
    "bridgeTabIds",
  ]);
  if (
    expectedPromptRunId &&
    state.activePromptRunId &&
    state.activePromptRunId !== expectedPromptRunId
  ) {
    // A newer stage already owns the lock — do not clear it, but still close stale tabs.
    await closeTrackedBridgeTabs(state, { keepActive: true });
    return;
  }
  await closeTrackedBridgeTabs(state, { keepActive: false });
}

async function closeTrackedBridgeTabs(state, { keepActive = false } = {}) {
  const ids = new Set();
  if (Array.isArray(state.bridgeTabIds)) {
    for (const id of state.bridgeTabIds) {
      if (id != null) ids.add(id);
    }
  }
  if (state.activeTabId != null) ids.add(state.activeTabId);

  for (const tabId of ids) {
    if (keepActive && tabId === state.activeTabId) continue;
    try {
      await chrome.tabs.remove(tabId);
      console.info("[JobApp Bridge] closed ChatGPT tab", tabId);
    } catch {
      /* already closed */
    }
  }

  if (!keepActive) {
    await clearSessionLock();
  } else {
    const remaining = state.activeTabId != null ? [state.activeTabId] : [];
    await chrome.storage.session.set({ bridgeTabIds: remaining });
  }
}

async function cleanupAndCloseTab(promptRunId) {
  const state = await chrome.storage.session.get(["activeTabId", "bridgeTabIds"]);
  const tabId = state.activeTabId;
  let deleted = false;

  if (tabId != null) {
    try {
      const cleanup = await withTimeout(
        chrome.tabs.sendMessage(tabId, {
          type: "JOBAPP_CLEANUP_SESSION",
        }),
        20000,
        "cleanup_timeout",
      );
      deleted = Boolean(cleanup?.deleted);
      console.info("[JobApp Bridge] cleanup result", cleanup);
    } catch (e) {
      console.warn("[JobApp Bridge] session cleanup message failed", e);
      // Content script may have been invalidated — reinject and retry once.
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        await sleep(500);
        const cleanup = await withTimeout(
          chrome.tabs.sendMessage(tabId, {
            type: "JOBAPP_CLEANUP_SESSION",
          }),
          15000,
          "cleanup_retry_timeout",
        );
        deleted = Boolean(cleanup?.deleted);
      } catch (e2) {
        console.warn("[JobApp Bridge] cleanup retry failed", e2);
      }
    }
    await sleep(deleted ? 200 : 350);
  }

  // Always force-close every tab this bridge opened for the stage.
  await closeActiveBridgeTab(promptRunId);
  return { deleted };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await chrome.storage.session.get(["activeTabId"]);
  if (state.activeTabId === tabId) {
    await clearSessionLock();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JOBAPP_LOCAL_SIGNAL" && message.payload) {
    (async () => {
      const settings = await getSettings();
      if (!settings.enabled || !settings.token) {
        sendResponse({
          ok: false,
          error: "Token not configured in extension Options",
        });
        return;
      }
      try {
        const result = await openAndRun(message.payload, {
          force: Boolean(message.payload?.force || message.force),
        });
        sendResponse({
          ok: Boolean(result.opened),
          ...result,
        });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (message?.type === "JOBAPP_SUBMIT_RESPONSE") {
    (async () => {
      let pasteOk = false;
      let result = null;
      try {
        if (!message.raw_response?.trim()) {
          throw new Error("Empty ChatGPT response");
        }
        // Cap wait so cleanup/close still runs if Drive/Gmail work is slow.
        result = await withTimeout(
          api("/api/extension/paste-back", {
            method: "POST",
            body: JSON.stringify({
              prompt_run_id: message.prompt_run_id,
              raw_response: message.raw_response,
              partial: Boolean(message.partial),
            }),
          }),
          120000,
          "paste_back_timeout",
        );
        pasteOk = Boolean(result?.ok !== false);
      } catch (e) {
        const permanent =
          Boolean(e.data?.permanent) ||
          Boolean(e.data?.reconnect_required) ||
          /google|drive export|token revoked|not connected/i.test(
            e.message || "",
          );
        try {
          await api("/api/extension/report-error", {
            method: "POST",
            body: JSON.stringify({
              prompt_run_id: message.prompt_run_id,
              message: e.data?.error || e.message,
              details: e.data || null,
            }),
          });
        } catch {
          /* ignore */
        }
        // Always delete + close after a real ChatGPT reply so tabs never linger.
        try {
          if (pasteOk || message.raw_response?.trim() || permanent) {
            await cleanupAndCloseTab(message.prompt_run_id);
          } else {
            await clearSessionLock();
          }
        } catch {
          await clearSessionLock();
        }
        sendResponse({
          ok: false,
          error: e.data?.error || e.message,
          data: e.data,
          permanent,
        });
        return;
      }

      // Cleanup/close first (now much faster), then open the next stage.
      const cleanup = await cleanupAndCloseTab(message.prompt_run_id);
      sendResponse({ ok: true, result, cleaned_up: true, ...cleanup });

      const next = result?.next_pending;
      if (next?.prompt_run_id && next?.prompt_text) {
        console.info(
          "[JobApp Bridge] chaining next stage",
          next.kind,
          next.prompt_run_id,
        );
        await sleep(150);
        try {
          await openAndRun(
            {
              prompt_run_id: next.prompt_run_id,
              pipeline_run_id: next.pipeline_run_id,
              kind: next.kind,
              prompt_text: next.prompt_text,
              chatgpt_url: next.chatgpt_url || "https://chatgpt.com/",
              ts: Date.now(),
              force: true,
            },
            { force: true },
          );
        } catch (chainErr) {
          console.warn(
            "[JobApp Bridge] next-stage chain failed",
            chainErr?.message || chainErr,
          );
        }
      }
    })();
    return true;
  }

  if (message?.type === "JOBAPP_CLOSE_TAB") {
    (async () => {
      await closeActiveBridgeTab(message.prompt_run_id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "JOBAPP_CLEAR_LOCK") {
    (async () => {
      const state = await chrome.storage.session.get([
        "activeTabId",
        "bridgeTabIds",
      ]);
      await closeTrackedBridgeTabs(state, { keepActive: false });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "JOBAPP_GET_ACTIVE") {
    chrome.storage.session.get(["activePrompt"]).then((v) => {
      sendResponse(v.activePrompt || null);
    });
    return true;
  }

  if (message?.type === "JOBAPP_REPORT_ERROR") {
    (async () => {
      try {
        await api("/api/extension/report-error", {
          method: "POST",
          body: JSON.stringify({
            prompt_run_id: message.prompt_run_id,
            message: message.message || "Content script error",
          }),
        });
      } catch {
        /* ignore */
      }
      // Drop lock so the next pipeline wake can reopen ChatGPT.
      await clearSessionLock();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "JOBAPP_PING") {
    getSettings().then((s) => {
      sendResponse({
        ok: true,
        enabled: s.enabled,
        hasToken: Boolean(s.token),
        appUrl: s.appUrl,
        version: "1.3.18",
      });
    });
    return true;
  }
});
