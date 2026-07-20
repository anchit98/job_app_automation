const TIMEOUT_MS = 5 * 60 * 1000;
let runningPromptId = null;
let runGeneration = 0;
let runPhase = "idle";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fixed/sticky composers often have offsetParent === null — don't use that. */
function isUsable(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const r = el.getBoundingClientRect();
  return (
    r.width > 24 &&
    r.height > 12 &&
    r.bottom > 0 &&
    r.top < window.innerHeight + 40
  );
}

function resolveEditable(el) {
  if (!el) return null;
  if (
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.getAttribute("contenteditable") === "true"
  ) {
    return el;
  }
  return (
    el.querySelector("[contenteditable='true']") ||
    el.querySelector("textarea") ||
    null
  );
}

function composerTextLength(el) {
  if (!el) return 0;
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return (el.value || "").trim().length;
  }
  return (el.innerText || el.textContent || "").trim().length;
}

function findComposer() {
  const selectors = [
    "#prompt-textarea",
    "div#prompt-textarea",
    "div[contenteditable='true']#prompt-textarea",
    "div[contenteditable='true'][data-id='root']",
    "div[role='textbox'][contenteditable='true']",
    "textarea[name='prompt-textarea']",
    "textarea[data-id='root']",
    "textarea[placeholder*='Message']",
    "textarea[placeholder*='Ask']",
    "div.ProseMirror[contenteditable='true']",
    "div[contenteditable='true'][data-placeholder]",
    "main div[contenteditable='true']",
    "form div[contenteditable='true']",
  ];
  for (const sel of selectors) {
    const raw = document.querySelector(sel);
    const el = resolveEditable(raw) || raw;
    if (isUsable(el)) return el;
  }
  const editables = [...document.querySelectorAll("[contenteditable='true']")];
  return (
    editables
      .filter((el) => {
        if (!isUsable(el)) return false;
        return el.getBoundingClientRect().top > window.innerHeight * 0.35;
      })
      .sort(
        (a, b) =>
          b.getBoundingClientRect().width * b.getBoundingClientRect().height -
          a.getBoundingClientRect().width * a.getBoundingClientRect().height,
      )[0] || null
  );
}

function isSendEnabled(el) {
  if (!el) return false;
  if (el.disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.getAttribute("data-disabled") === "true") return false;
  if (el.classList.contains("disabled")) return false;
  const opacity = Number.parseFloat(window.getComputedStyle(el).opacity || "1");
  if (opacity < 0.4) return false;
  return isUsable(el);
}

function findSendButton({ requireEnabled = true } = {}) {
  const selectors = [
    "button[data-testid='send-button']",
    "button[data-testid='fruitjuice-send-button']",
    "button[aria-label='Send prompt']",
    "button[aria-label='Send message']",
    "button[aria-label*='Send prompt']",
    "button[aria-label*='Send message']",
    "form button[type='submit']",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el || !isUsable(el)) continue;
    if (requireEnabled && !isSendEnabled(el)) continue;
    return el;
  }
  // Do not fall back to arbitrary SVG buttons — that clicks the wrong control.
  return null;
}

function placeCaretInComposer(el) {
  el.focus();
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    /* ignore */
  }
}

function clearComposer(el) {
  placeCaretInComposer(el);
  try {
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  } catch {
    /* ignore */
  }
  // Ensure ProseMirror sees an empty doc
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);
  } catch {
    /* ignore */
  }
}

function insertViaExecCommand(el, text) {
  placeCaretInComposer(el);
  try {
    document.execCommand("selectAll", false);
  } catch {
    /* ignore */
  }
  const ok = document.execCommand("insertText", false, text);
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text.slice(0, 32),
    }),
  );
  return ok;
}

/** Chunked insert helps ProseMirror accept long JD prompts. */
function insertViaChunks(el, text, chunkSize = 1200) {
  clearComposer(el);
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    placeCaretInComposer(el);
    const ok = document.execCommand("insertText", false, chunk);
    if (!ok) return false;
  }
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text.slice(0, 32),
    }),
  );
  return true;
}

function pasteViaClipboardEvent(el, text) {
  placeCaretInComposer(el);
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  el.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function waitForSendEnabled(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = findSendButton({ requireEnabled: true });
    if (btn) return btn;
    await sleep(200);
  }
  return null;
}

async function setComposerText(el, text) {
  el.focus();
  try {
    el.click();
  } catch {
    /* ignore */
  }
  await sleep(120);

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const proto = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    );
    if (proto?.set) proto.set.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // Prefer execCommand — synthetic clipboard paste often paints DOM without
  // updating ProseMirror, which leaves Send aria-disabled forever.
  clearComposer(el);
  await sleep(80);

  let inserted = insertViaExecCommand(el, text);
  await sleep(200);
  if (!findSendButton({ requireEnabled: true })) {
    inserted = insertViaChunks(el, text);
    await sleep(250);
  }
  if (!findSendButton({ requireEnabled: true })) {
    clearComposer(el);
    pasteViaClipboardEvent(el, text);
    await sleep(250);
  }
  if (!inserted) {
    /* still try send-enable wait below */
  }
}

async function clickSend(btn) {
  if (!btn) return false;
  btn.focus();
  try {
    btn.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    btn.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    btn.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, cancelable: true }),
    );
    btn.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
    );
  } catch {
    /* ignore */
  }
  btn.click();
  return true;
}

async function submitComposer(composer) {
  const enabled = await waitForSendEnabled(10000);
  if (enabled) {
    await clickSend(enabled);
  } else {
    // Last resort: Enter — only works if ProseMirror actually has content.
    composer.focus();
    composer.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  const start = Date.now();
  while (Date.now() - start < 8000) {
    await sleep(300);
    // Sent successfully: composer cleared, or Stop button appeared, or user turn exists.
    if (composerTextLength(composer) < 15) return true;
    if (isStreaming()) return true;
    if (
      document.querySelector(
        "[data-message-author-role='user'], [data-testid*='user-message']",
      )
    ) {
      // Composer may still hold draft on some builds — streaming is the better signal.
      if (isStreaming() || composerTextLength(composer) < 15) return true;
    }
  }
  return composerTextLength(composer) < 15 || isStreaming();
}

function isStreaming() {
  return Boolean(
    document.querySelector("button[data-testid='stop-button']") ||
      document.querySelector("button[aria-label*='Stop generating']") ||
      document.querySelector("button[aria-label='Stop']") ||
      document.querySelector("button[aria-label*='Stop']") ||
      document.querySelector("[aria-label='Stop generating']") ||
      document.querySelector("button[aria-label*='stop' i]"),
  );
}

function extractAssistantText() {
  const selectors = [
    "[data-message-author-role='assistant']",
    "div[data-message-author-role='assistant']",
    "[data-testid='assistant-message']",
    "div[data-testid*='assistant']",
    "article[data-testid*='conversation-turn']",
  ];
  let nodes = [];
  for (const sel of selectors) {
    nodes = [...document.querySelectorAll(sel)];
    if (nodes.length) break;
  }
  if (!nodes.length) {
    nodes = [
      ...document.querySelectorAll(
        "main .markdown, main .prose, main [class*='markdown']",
      ),
    ];
  }
  // Prefer the last non-empty assistant turn
  for (let i = nodes.length - 1; i >= 0; i--) {
    const text = (nodes[i].innerText || nodes[i].textContent || "").trim();
    if (text.length > 0) return text;
  }
  return "";
}

function looksLikeJson(text) {
  const t = text.trim();
  return (
    (t.startsWith("{") && t.includes("}")) ||
    (t.startsWith("```") && t.includes("{"))
  );
}

async function waitForResponseComplete(startedAt, baselineText) {
  let lastText = "";
  let stableSince = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(400);
    if (isStreaming()) {
      stableSince = Date.now();
      continue;
    }
    let text = extractAssistantText();
    if (baselineText && text === baselineText) {
      continue;
    }
    // Prefer the newest assistant turn that differs from baseline
    if (text && text !== lastText) {
      lastText = text;
      stableSince = Date.now();
      continue;
    }
    if (!lastText || lastText.length <= 40) continue;

    const stableMs = Date.now() - stableSince;
    // Structured JSON settles faster than freeform prose.
    const needed = looksLikeJson(lastText) ? 900 : 1400;
    if (stableMs > needed) {
      return { text: lastText, partial: false };
    }
  }
  const finalText = extractAssistantText();
  return {
    text: finalText && finalText !== baselineText ? finalText : finalText,
    partial: true,
  };
}

function showBanner(text, color = "#111") {
  let banner = document.getElementById("jobapp-bridge-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "jobapp-bridge-banner";
    banner.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483647;color:#fff;padding:10px 14px;border-radius:10px;font:13px/1.3 system-ui;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.35)";
    document.body.appendChild(banner);
  }
  banner.style.background = color;
  banner.textContent = text;
  return banner;
}

function conversationIdFromUrl() {
  const match = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return match?.[1] || null;
}

async function getChatGptAccessToken() {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.accessToken || null;
  } catch {
    return null;
  }
}

/** Soft-delete via ChatGPT backend (hides conversation from history). */
async function deleteConversationViaApi(conversationId) {
  const token = await getChatGptAccessToken();
  if (!token) return false;

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const endpoints = [
    async () =>
      fetch(`/backend-api/conversation/${conversationId}`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({ is_visible: false }),
      }),
    async () =>
      fetch(`/backend-api/conversation/${conversationId}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      }),
    async () =>
      fetch(`/backend-api/conversations`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({
          conversation_ids: [conversationId],
          is_visible: false,
        }),
      }),
  ];

  for (const call of endpoints) {
    try {
      const res = await call();
      if (res.ok || res.status === 404 || res.status === 204) return true;
      console.warn("[JobApp Bridge] delete attempt status", res.status);
    } catch (e) {
      console.warn("[JobApp Bridge] delete attempt failed", e);
    }
  }
  return false;
}

function clickFirstMatching(elements, pattern) {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const el = [...elements].find((node) => {
    const label = `${node.getAttribute?.("aria-label") || ""} ${node.textContent || ""}`.trim();
    return re.test(label) && node.offsetParent !== null;
  });
  if (el) {
    el.click();
    return true;
  }
  return false;
}

/** DOM fallback when API delete is unavailable. */
async function deleteConversationViaDom() {
  const optionSelectors = [
    'button[data-testid="conversation-options-button"]',
    'button[aria-label*="conversation options" i]',
    'button[aria-label*="Chat options" i]',
    'button[aria-label*="Open conversation options" i]',
    'button[aria-label*="More options" i]',
  ];

  let opened = false;
  for (const sel of optionSelectors) {
    const btn = document.querySelector(sel);
    if (btn && btn.offsetParent !== null) {
      btn.click();
      opened = true;
      break;
    }
  }

  if (!opened) {
    const href = location.pathname;
    const links = [...document.querySelectorAll('nav a[href*="/c/"]')];
    const active =
      links.find((a) => a.getAttribute("aria-current") === "page") ||
      links.find((a) => href.includes(a.getAttribute("href") || "")) ||
      links[0];
    if (active) {
      active.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await sleep(200);
      const nearby = active.closest("div") || active.parentElement;
      const menuBtn = nearby?.querySelector(
        'button[aria-label*="options" i], button[aria-haspopup], button',
      );
      if (menuBtn) {
        menuBtn.click();
        opened = true;
      }
    }
  }

  if (!opened) return false;
  await sleep(400);

  const menuItems = document.querySelectorAll(
    '[role="menuitem"], [role="option"], button, div[role="menuitem"]',
  );
  const clickedDelete = clickFirstMatching(
    menuItems,
    /delete|move to trash|trash/,
  );
  if (!clickedDelete) return false;

  await sleep(500);
  const confirmBtns = document.querySelectorAll(
    'button, [role="button"], [data-testid*="delete"]',
  );
  clickFirstMatching(confirmBtns, /delete|confirm|move to trash|yes/);
  await sleep(400);
  return true;
}

async function cleanupChatGptSession() {
  showBanner("JobApp Bridge: deleting ChatGPT session…", "#333");
  let deleted = false;
  let lastId = conversationIdFromUrl();

  // URL may update slightly after the first reply — retry briefly.
  for (let i = 0; i < 6 && !deleted; i++) {
    const id = conversationIdFromUrl() || lastId;
    if (id) {
      lastId = id;
      console.info("[JobApp Bridge] deleting conversation", id);
      deleted = await deleteConversationViaApi(id);
      if (deleted) break;
    }
    await sleep(250);
  }

  if (!deleted) {
    console.warn("[JobApp Bridge] API delete missed — trying DOM fallback");
    deleted = await deleteConversationViaDom();
  }

  console.info("[JobApp Bridge] session delete result", { deleted, lastId });
  showBanner(
    deleted
      ? "JobApp Bridge: session deleted — closing tab…"
      : "JobApp Bridge: closing tab…",
    deleted ? "#0a7" : "#555",
  );
  await sleep(deleted ? 200 : 100);
  return { deleted };
}

function ensurePageBridge() {
  if (window.__jobappPageBridgeReady) {
    return window.__jobappPageBridgeReady;
  }
  window.__jobappPageBridgeReady = new Promise((resolve) => {
    if (document.documentElement.dataset.jobappPageBridge === "1") {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.onload = () => {
      document.documentElement.dataset.jobappPageBridge = "1";
      // Small delay so the IIFE can attach its message listener.
      setTimeout(() => resolve(true), 50);
    };
    script.onerror = () => resolve(false);
    (document.head || document.documentElement).appendChild(script);
  });
  return window.__jobappPageBridgeReady;
}

async function pagePaste(text, autoSend) {
  await ensurePageBridge();
  const requestId = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "page_bridge_timeout" });
    }, 15000);

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== "JOBAPP_PAGE_PASTE_RESULT") return;
      if (data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: "JOBAPP_PAGE_PASTE",
        requestId,
        text,
        autoSend: Boolean(autoSend),
      },
      "*",
    );
  });
}

async function ensureComposerFilled(composer, text) {
  // Page-world paste is the reliable path for ProseMirror + Send enablement.
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await pagePaste(text, false);
    if (result?.ok && result.sendEnabled) {
      console.info("[JobApp Bridge] page paste accepted", result);
      return true;
    }
    console.warn("[JobApp Bridge] page paste retry", attempt, result);

    // Isolated-world fallback
    composer = findComposer() || composer;
    if (composer) {
      await setComposerText(composer, text);
      await sleep(400);
      if (findSendButton({ requireEnabled: true })) return true;
    }

    showBanner(
      `JobApp Bridge: paste retry ${attempt + 1}/4 (waiting for Send)…`,
      "#555",
    );
    await sleep(400 + attempt * 200);
  }
  return Boolean(findSendButton({ requireEnabled: true }));
}

async function runPrompt(payload, { force = false } = {}) {
  if (!payload?.prompt_run_id || !payload?.prompt_text) return;

  // Never abort an in-flight paste or wait unless this is an explicit force retry.
  if (
    runningPromptId === payload.prompt_run_id &&
    (runPhase === "waiting" || runPhase === "pasting") &&
    !force
  ) {
    console.info(
      "[JobApp Bridge] already running — ignore reinject",
      payload.prompt_run_id,
      runPhase,
    );
    return;
  }

  // Different run while busy: only take over if forced (new pipeline stage).
  if (
    runningPromptId &&
    runningPromptId !== payload.prompt_run_id &&
    (runPhase === "waiting" || runPhase === "pasting") &&
    !force
  ) {
    console.info("[JobApp Bridge] busy with another run", runningPromptId);
    return;
  }

  const myGen = ++runGeneration;
  runningPromptId = payload.prompt_run_id;
  runPhase = "pasting";
  showBanner(`JobApp Bridge: running ${payload.kind}…`);

  try {
    let composer = null;
    for (let i = 0; i < 60; i++) {
      if (myGen !== runGeneration) return;
      composer = findComposer();
      if (composer) break;
      await sleep(500);
    }
    if (!composer) {
      throw new Error(
        "Could not find ChatGPT input box — log in and wait for the composer.",
      );
    }

    const baseline = extractAssistantText();

    showBanner(`JobApp Bridge: pasting ${payload.kind} — sending (no web search)…`);
    // Single page-world paste+send (avoids fill-then-paste-again).
    let pageSend = await pagePaste(payload.prompt_text, true);
    let sent = Boolean(pageSend?.ok && pageSend.sent);
    if (!sent) {
      const filled = await ensureComposerFilled(composer, payload.prompt_text);
      if (myGen !== runGeneration) return;
      if (!filled) {
        throw new Error(
          "ChatGPT did not accept the paste (Send stayed disabled). Click the composer and try Open ChatGPT again.",
        );
      }
      composer = findComposer() || composer;
      pageSend = await pagePaste(payload.prompt_text, true);
      sent = Boolean(pageSend?.ok && pageSend.sent);
      if (!sent) {
        sent = await submitComposer(composer);
      }
      if (!sent && !isStreaming()) {
        sent = await submitComposer(findComposer() || composer);
      }
    }
    if (myGen !== runGeneration) return;
    if (!sent && !isStreaming()) {
      throw new Error(
        "Send did not go through — press Enter in ChatGPT or retry Open ChatGPT.",
      );
    }

    runPhase = "waiting";
    showBanner(`JobApp Bridge: waiting for ${payload.kind} reply…`);
    const startedAt = Date.now();
    // Short settle so streaming UI can appear; response waiter polls quickly after.
    await sleep(400);
    if (myGen !== runGeneration) return;
    const { text, partial } = await waitForResponseComplete(startedAt, baseline);
    if (myGen !== runGeneration) return;
    if (!text || text.length < 20) {
      throw new Error("Empty or too-short ChatGPT response");
    }

    runPhase = "done";
    const result = await chrome.runtime.sendMessage({
      type: "JOBAPP_SUBMIT_RESPONSE",
      prompt_run_id: payload.prompt_run_id,
      raw_response: text,
      partial: partial && !looksLikeJson(text),
    });

    showBanner(
      result?.ok
        ? "JobApp Bridge: response sent ✓ — closing…"
        : `JobApp Bridge failed: ${result?.error || "unknown"}`,
      result?.ok ? "#0a7" : "#a30",
    );
  } catch (e) {
    if (myGen !== runGeneration) return;
    runPhase = "idle";
    showBanner(`JobApp Bridge error: ${e.message}`, "#a30");
    console.error("[JobApp Bridge] runPrompt failed", e);
    try {
      await chrome.runtime.sendMessage({
        type: "JOBAPP_REPORT_ERROR",
        prompt_run_id: payload.prompt_run_id,
        message: e.message,
      });
    } catch {
      /* ignore */
    }
  } finally {
    if (myGen === runGeneration) {
      runningPromptId = null;
      if (runPhase !== "done") runPhase = "idle";
    }
    setTimeout(() => {
      if (myGen === runGeneration) {
        document.getElementById("jobapp-bridge-banner")?.remove();
      }
    }, 6000);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "JOBAPP_RUN_PROMPT" && message.payload) {
    // force only when background marks stage change / manual retry — not same-run ticks.
    const force = Boolean(message.force);
    void runPrompt(message.payload, { force });
    sendResponse?.({ ok: true, started: true, phase: runPhase });
    return;
  }
  if (message?.type === "JOBAPP_GET_PHASE") {
    sendResponse?.({
      ok: true,
      phase: runPhase,
      prompt_run_id: runningPromptId,
    });
    return;
  }
  if (message?.type === "JOBAPP_CLEANUP_SESSION") {
    cleanupChatGptSession()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// New ChatGPT tab: pick up claimed prompt if SW inject hasn't started yet.
// Never force — SW inject may arrive around the same time.
chrome.runtime.sendMessage({ type: "JOBAPP_GET_ACTIVE" }).then((active) => {
  if (active?.prompt_text) {
    setTimeout(() => runPrompt(active, { force: false }), 800);
  }
});
