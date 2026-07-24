/**
 * Pack ../extension into public/downloads/jobapp-bridge.zip
 * Run: node scripts/pack-extension-zip.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..");
const extensionDir = path.join(repoRoot, "extension");
const outDir = path.join(webRoot, "public", "downloads");
const outZip = path.join(outDir, "jobapp-bridge.zip");

const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "app-bridge.js",
  "page-bridge.js",
  "options.html",
  "options.js",
  "popup.html",
];

for (const f of files) {
  const p = path.join(extensionDir, f);
  if (!fs.existsSync(p)) {
    console.error(`Missing extension file: ${f}`);
    process.exit(1);
  }
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

const isWin = process.platform === "win32";
if (isWin) {
  const fileList = files.map((f) => `"${f}"`).join(",");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${fileList} -DestinationPath "${outZip}" -Force`,
    ],
    { cwd: extensionDir, stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-q", "-j", outZip, ...files.map((f) => path.join(extensionDir, f))], {
    stdio: "inherit",
  });
}

const stat = fs.statSync(outZip);
console.log(`Wrote ${outZip} (${stat.size} bytes)`);
