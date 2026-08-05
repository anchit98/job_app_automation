import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "bakeoff-out");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(root, ".env.testing.local"));

const model = process.argv[2];
const promptFile = process.argv[3];
const outFile = process.argv[4];
const maxTokens = Number(process.argv[5] || 6144);

const prompt = fs.readFileSync(promptFile, "utf8");
const body = {
  model,
  temperature: 0.2,
  top_p: 0.9,
  max_tokens: maxTokens,
  stream: false,
  messages: [
    {
      role: "system",
      content:
        "You are a careful assistant for job-application automation. Return ONLY valid JSON matching the user's schema. No markdown fences, no preamble, no reasoning outside JSON.",
    },
    { role: "user", content: prompt },
  ],
};
fs.writeFileSync(outFile, JSON.stringify(body), "utf8");
console.log("wrote", outFile, "bytes", Buffer.byteLength(JSON.stringify(body)));
