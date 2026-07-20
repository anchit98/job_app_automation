/**
 * Inspect cover letter master Google Doc paragraph structure.
 * Usage: npx tsx scripts/inspect-cover-letter-doc.ts [docId]
 */
import fs from "fs";
import path from "path";
import { DocsClient, extractParagraphText } from "../src/lib/google/docs";
import { getGoogleAuthClient } from "../src/lib/google/tokens";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const DOC_ID =
  process.argv[2] ?? "1niJmOSYR6oL1rc4aX08oVWc7cCwE8dXtXNrwsmO3nh4";

async function main() {
  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const doc = await docs.getDocument(DOC_ID);
  const paragraphs = extractParagraphText(doc);
  console.log(`Document: ${doc.title}`);
  console.log(`Paragraphs: ${paragraphs.length}\n`);
  paragraphs.forEach((p, i) => {
    const preview = p.replace(/\n/g, "\\n");
    console.log(`${String(i).padStart(2, "0")}: ${JSON.stringify(preview)}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
