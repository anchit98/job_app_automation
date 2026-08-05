import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const key = (env.match(/^NVIDIA_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!key) {
  console.log("NO_KEY");
  process.exit(1);
}

const reqPath = path.join(root, "bakeoff-out/_probe_llama.json");
fs.mkdirSync(path.dirname(reqPath), { recursive: true });
fs.writeFileSync(
  reqPath,
  JSON.stringify({
    model: "meta/llama-3.3-70b-instruct",
    messages: [{ role: "user", content: 'Reply with exactly {"ok":true}' }],
    max_tokens: 32,
    temperature: 0,
  }),
);

try {
  const out = execFileSync(
    "curl.exe",
    [
      "-sS",
      "-m",
      "45",
      "-w",
      "\nHTTP:%{http_code}",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      "-H",
      `Authorization: Bearer ${key}`,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      `@${reqPath}`,
    ],
    { encoding: "utf8", timeout: 50000 },
  );
  console.log(out.replace(/Bearer\s+\S+/g, "Bearer [REDACTED]").slice(0, 500));
} catch (e) {
  console.log("FAIL", String(e.message || e).slice(0, 400));
  process.exit(1);
}
