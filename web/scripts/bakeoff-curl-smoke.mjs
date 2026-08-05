import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const key = fs
  .readFileSync(path.join(root, ".env.testing.local"), "utf8")
  .match(/NVIDIA_API_KEY=(.+)/)[1]
  .trim();

const r = spawnSync(
  "curl.exe",
  [
    "-sS",
    "-m",
    "90",
    "-w",
    "\nHTTP:%{http_code} TIME:%{time_total}\n",
    "https://integrate.api.nvidia.com/v1/chat/completions",
    "-H",
    `Authorization: Bearer ${key}`,
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    "@bakeoff-out/req_gemma_jd.json",
    "-o",
    "bakeoff-out/raw/_node_curl_test.json",
  ],
  { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
console.log("exit", r.status);
console.log("stdout", r.stdout);
console.log("stderr", r.stderr);
const p = path.join(root, "bakeoff-out/raw/_node_curl_test.json");
console.log(
  "exists",
  fs.existsSync(p),
  "size",
  fs.existsSync(p) ? fs.statSync(p).size : 0,
);
