import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const envPath = path.join(root, ".env.testing.local");
const env = fs.readFileSync(envPath, "utf8");
const key = (env.match(/CHATGPT_API_KEY=([^\r\n]+)/) || [])[1]?.trim();
if (!key) {
  console.log("NO_KEY at", envPath);
  process.exit(1);
}

const reqPath = path.join(root, "bakeoff-out/_probe_openai.json");
fs.mkdirSync(path.dirname(reqPath), { recursive: true });
fs.writeFileSync(
  reqPath,
  JSON.stringify({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "Return ONLY JSON." },
      { role: "user", content: 'Reply with exactly {"ok":true}' },
    ],
    max_tokens: 32,
    temperature: 0,
  }),
);

const started = Date.now();
try {
  const out = execFileSync(
    "curl.exe",
    [
      "-sS",
      "-m",
      "45",
      "-w",
      "\nHTTP:%{http_code}",
      "https://api.openai.com/v1/chat/completions",
      "-H",
      `Authorization: Bearer ${key}`,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      `@${reqPath}`,
    ],
    { encoding: "utf8", timeout: 50000 },
  );
  const http = (out.match(/HTTP:(\d+)/) || [])[1];
  const body = out
    .replace(/\nHTTP:\d+$/, "")
    .replace(/sk-[^\s"]+/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 400);
  console.log(`gpt-4.1-mini -> HTTP ${http} in ${Date.now() - started}ms`);
  console.log(body);
  if (http !== "200") process.exit(1);
} catch (e) {
  const msg = String(e.stderr || e.message || e)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[^\s"]+/g, "[REDACTED]")
    .slice(0, 300);
  console.log(`FAIL in ${Date.now() - started}ms :: ${msg}`);
  process.exit(1);
}
