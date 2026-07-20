/**
 * Runs in the ChatGPT page world so ProseMirror sees real editing commands.
 * Talks to the extension content script via window.postMessage.
 */
(function () {
  if (window.__JOBAPP_PAGE_BRIDGE__) return;
  window.__JOBAPP_PAGE_BRIDGE__ = true;

  function findComposer() {
    const selectors = [
      "#prompt-textarea",
      "div[contenteditable='true']#prompt-textarea",
      "div[contenteditable='true'][data-id='root']",
      "div[role='textbox'][contenteditable='true']",
      "div.ProseMirror[contenteditable='true']",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (el.getAttribute("contenteditable") === "true") return el;
      const inner = el.querySelector("[contenteditable='true']");
      if (inner) return inner;
    }
    return null;
  }

  function findSendEnabled() {
    const btn =
      document.querySelector("button[data-testid='send-button']") ||
      document.querySelector("button[data-testid='fruitjuice-send-button']") ||
      document.querySelector("button[aria-label='Send prompt']") ||
      document.querySelector("button[aria-label*='Send message']");
    if (!btn) return null;
    if (btn.disabled) return null;
    if (btn.getAttribute("aria-disabled") === "true") return null;
    return btn;
  }

  function placeCaret(el) {
    el.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearComposer(el) {
    placeCaret(el);
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  }

  function insertText(el, text) {
    clearComposer(el);
    placeCaret(el);
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

  function insertChunks(el, text, size) {
    clearComposer(el);
    for (let i = 0; i < text.length; i += size) {
      placeCaret(el);
      if (!document.execCommand("insertText", false, text.slice(i, i + size))) {
        return false;
      }
    }
    return true;
  }

  function isPressed(el) {
    if (!el) return false;
    return (
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      el.dataset.state === "on" ||
      el.dataset.active === "true"
    );
  }

  /** Turn off Search / Deep research / other composer tools — plain chat only. */
  function disableComposerExtras() {
    const chipRoots = document.querySelectorAll(
      [
        '[data-testid="system-hint-search"]',
        '[data-testid="system-hint-research"]',
        '[data-testid="system-hint-picture_v2"]',
        '[data-testid*="system-hint-search"]',
        '[data-testid*="composer-footer-tool"]',
        '[data-testid="composer-action-system-hint-button"]',
      ].join(","),
    );

    for (const root of chipRoots) {
      const remove =
        root.querySelector(
          'button[aria-label*="Remove" i], button[aria-label*="Close" i], button[aria-label*="Dismiss" i], button[aria-label*="Clear" i]',
        ) ||
        root.querySelector('button[data-testid*="remove"], button[data-testid*="close"]');
      if (remove) {
        remove.click();
        continue;
      }
      // Active hint chip itself is often a toggle — only click when already on.
      if (root.matches("button, [role='button']") && isPressed(root)) {
        root.click();
      }
    }

    // Composer toolbar toggles (Search / Research)
    const toggles = document.querySelectorAll(
      [
        'button[data-testid*="search" i]',
        'button[aria-label="Search"]',
        'button[aria-label*="Web search" i]',
        'button[aria-label*="Search the web" i]',
        'button[aria-label="Research"]',
        'button[aria-label*="Deep research" i]',
      ].join(","),
    );
    for (const btn of toggles) {
      // Never click Send
      const testId = btn.getAttribute("data-testid") || "";
      const label = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
      if (/send/i.test(testId) || label.includes("send")) continue;
      // Only turn OFF — never enable Search by clicking an idle toggle.
      if (isPressed(btn)) btn.click();
    }

    // Pill near composer that says "Search" with an X
    for (const el of document.querySelectorAll("button, div[role='button']")) {
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
      if (!/^search$/i.test(label) && !/^web search$/i.test(label)) continue;
      if (isPressed(el)) el.click();
      const close = el.querySelector(
        'button[aria-label*="Remove" i], button[aria-label*="Close" i], svg',
      );
      // If this is an active tool chip container, prefer its close control
      const parent = el.closest('[data-testid*="system-hint"], [class*="hint"]');
      const parentClose = parent?.querySelector(
        'button[aria-label*="Remove" i], button[aria-label*="Close" i]',
      );
      if (parentClose) parentClose.click();
      else if (close && close !== el && isPressed(el)) close.click();
    }
  }

  async function pasteAndMaybeSend(text, autoSend) {
    disableComposerExtras();
    await new Promise((r) => setTimeout(r, 40));

    const el = findComposer();
    if (!el) {
      return { ok: false, error: "no_composer", sendEnabled: false };
    }

    let ok = insertText(el, text);
    await new Promise((r) => setTimeout(r, 120));
    // ChatGPT sometimes auto-attaches Search after detecting URLs — strip it.
    disableComposerExtras();
    await new Promise((r) => setTimeout(r, 40));
    let send = findSendEnabled();

    if (!send) {
      ok = insertChunks(el, text, 1000);
      await new Promise((r) => setTimeout(r, 160));
      disableComposerExtras();
      send = findSendEnabled();
    }

    if (!send) {
      placeCaret(el);
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((r) => setTimeout(r, 160));
      disableComposerExtras();
      send = findSendEnabled();
    }

    if (!send) {
      return {
        ok: false,
        error: "send_disabled",
        sendEnabled: false,
        textLen: (el.innerText || "").trim().length,
      };
    }

    if (autoSend) {
      disableComposerExtras();
      await new Promise((r) => setTimeout(r, 40));
      send = findSendEnabled() || send;
      send.click();
      await new Promise((r) => setTimeout(r, 180));
    }

    return {
      ok: true,
      sendEnabled: true,
      sent: Boolean(autoSend),
      textLen: (el.innerText || "").trim().length,
      searchDisabled: true,
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "JOBAPP_PAGE_PASTE") return;
    pasteAndMaybeSend(data.text || "", Boolean(data.autoSend))
      .then((result) => {
        window.postMessage(
          {
            type: "JOBAPP_PAGE_PASTE_RESULT",
            requestId: data.requestId,
            ...result,
          },
          "*",
        );
      })
      .catch((e) => {
        window.postMessage(
          {
            type: "JOBAPP_PAGE_PASTE_RESULT",
            requestId: data.requestId,
            ok: false,
            error: e.message,
          },
          "*",
        );
      });
  });
})();
