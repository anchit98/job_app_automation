/**
 * Finish a pipeline stuck after cold_email (gmail_drafts pending).
 * Usage: node --import tsx scripts/finish-pipeline.ts <pipelineId>
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env.local") });

const pipelineId = process.argv[2];
if (!pipelineId) {
  console.error("Usage: npx tsx scripts/finish-pipeline.ts <pipelineId>");
  process.exit(1);
}

const { advancePipeline } = await import("../src/app/actions/pipeline.ts");
const result = await advancePipeline(pipelineId);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
