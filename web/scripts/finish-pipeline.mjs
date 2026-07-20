import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const pipelineId = process.argv[2] || "28565af0-6efd-4da1-ac5f-fcee7ec7a8e9";
const { advancePipeline } = await import("../src/app/actions/pipeline.ts");
console.log("advancing", pipelineId);
const result = await advancePipeline(pipelineId);
console.log(JSON.stringify(result, (_, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v), 2));
process.exit(result.ok ? 0 : 1);
