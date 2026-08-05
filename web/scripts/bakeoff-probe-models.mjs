import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";

const root = path.resolve(import.meta.dirname, "../..");
const key = fs
  .readFileSync(path.join(root, ".env.testing.local"), "utf8")
  .match(/NVIDIA_API_KEY=(.*)/)[1]
  .trim();
const models = [
  "google/gemma-4-31b-it",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2-instruct",
  "z-ai/glm-5.2",
  "z-ai/glm4-9b-chat",
  "nvidia/llama-3.1-nemotron-70b-instruct",
];
const reqPath = path.join(root, "bakeoff-out/_probe_req.json");

for (const m of models) {
  const body = {
    model: m,
    messages: [{ role: "user", content: 'Reply JSON only: {"ok":true}' }],
    max_tokens: 32,
    temperature: 0.1,
  };
  fs.writeFileSync(reqPath, JSON.stringify(body));
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
    const payload = out.replace(/\nHTTP:\d+\s*$/, "").replace(/\s+/g, " ").slice(0, 140);
    console.log(`${m} -> ${http} ${payload}`);
  } catch (e) {
    console.log(`${m} -> ERR ${String(e.message).slice(0, 140)}`);
  }
}
