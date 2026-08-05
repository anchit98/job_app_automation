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

const models = [
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-70b-instruct",
  "google/gemma-4-31b-it",
];

for (const model of models) {
  const reqPath = path.join(root, "bakeoff-out/_probe_model.json");
  fs.writeFileSync(
    reqPath,
    JSON.stringify({
      model,
      messages: [{ role: "user", content: "Say hi in 3 words." }],
      max_tokens: 16,
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
        "60",
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
      { encoding: "utf8", timeout: 70000 },
    );
    const http = (out.match(/HTTP:(\d+)/) || [])[1];
    const body = out.replace(/\nHTTP:\d+$/, "").replace(/\s+/g, " ").slice(0, 160);
    console.log(`${model} -> HTTP ${http} in ${Date.now() - started}ms :: ${body}`);
  } catch (e) {
    const msg = String(e.stderr || e.message || e)
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .slice(0, 180);
    console.log(`${model} -> FAIL in ${Date.now() - started}ms :: ${msg}`);
  }
}
