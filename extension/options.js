const defaults = {
  appUrl: "http://localhost:3000",
  token: "",
  enabled: true,
};

async function load() {
  const stored = await chrome.storage.sync.get(defaults);
  document.getElementById("appUrl").value = stored.appUrl || defaults.appUrl;
  document.getElementById("token").value = stored.token || "";
  document.getElementById("enabled").checked = stored.enabled !== false;
}

document.getElementById("save").addEventListener("click", async () => {
  const appUrl = document.getElementById("appUrl").value.trim();
  const token = document.getElementById("token").value.trim();
  const enabled = document.getElementById("enabled").checked;
  await chrome.storage.sync.set({ appUrl, token, enabled });
  document.getElementById("status").textContent = "Saved.";
});

load();
