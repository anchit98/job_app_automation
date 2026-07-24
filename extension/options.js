const defaults = {
  appUrl: "https://job-app-automation-mu.vercel.app",
  token: "",
  enabled: true,
};

const PROD_SCRIPT_ID = "jobapp-app-bridge-prod";

function normalizeAppUrl(raw) {
  const trimmed = (raw || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function isBuiltinOrigin(origin) {
  return (
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000" ||
    /^https:\/\/[^/]+\.vercel\.app$/i.test(origin)
  );
}

async function ensureHostAccess(origin) {
  const pattern = `${origin}/*`;
  const already = await chrome.permissions.contains({ origins: [pattern] });
  if (already) return { ok: true, granted: true };

  const granted = await chrome.permissions.request({ origins: [pattern] });
  return { ok: granted, granted };
}

async function ensureAppBridgeScript(origin) {
  // Static manifest already covers localhost + *.vercel.app.
  if (isBuiltinOrigin(origin)) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [PROD_SCRIPT_ID] });
    } catch {
      /* not registered */
    }
    return;
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [PROD_SCRIPT_ID] });
  } catch {
    /* ignore */
  }

  await chrome.scripting.registerContentScripts([
    {
      id: PROD_SCRIPT_ID,
      js: ["app-bridge.js"],
      matches: [`${origin}/*`],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

async function load() {
  const stored = await chrome.storage.sync.get(defaults);
  document.getElementById("appUrl").value = stored.appUrl || defaults.appUrl;
  document.getElementById("token").value = stored.token || "";
  document.getElementById("enabled").checked = stored.enabled !== false;
}

document.getElementById("save").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Saving…";
  status.style.color = "#555";

  const origin = normalizeAppUrl(document.getElementById("appUrl").value);
  const token = document.getElementById("token").value.trim();
  const enabled = document.getElementById("enabled").checked;

  if (!origin) {
    status.textContent =
      "Invalid App URL. Use https://your-app.vercel.app (no path, no trailing slash needed).";
    status.style.color = "#a30";
    return;
  }

  try {
    const access = await ensureHostAccess(origin);
    if (!access.granted) {
      status.textContent =
        "Permission denied. Click Allow when Chrome asks to access your production site.";
      status.style.color = "#a30";
      return;
    }

    await ensureAppBridgeScript(origin);
    await chrome.storage.sync.set({ appUrl: origin, token, enabled });
    status.textContent = `Saved. App URL: ${origin}. Reload the production tab after this.`;
    status.style.color = "#0a7";
  } catch (e) {
    status.textContent = e?.message || String(e);
    status.style.color = "#a30";
  }
});

load();
