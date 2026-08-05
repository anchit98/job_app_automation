/**
 * Render PlaySimple Gemma resume PDF via Google Docs template.
 * Usage (from web/): npx tsx scripts/bakeoff-render-playsimple-pdf.ts
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { DriveClient } from "../src/lib/google/drive";
import {
  DocsClient,
  buildReplaceRequests,
  buildSkillCategoryBoldRequests,
  type DocLayoutMap,
  type DocSlot,
} from "../src/lib/google/docs";
import { getGoogleAuthClient } from "../src/lib/google/tokens";
import type { ResumeContent } from "../src/lib/resume/fabrication";

const USER_ID = "ca7513be-4b5c-43a7-81f0-e98052689b6e";
const VERSION = 904;
const ROOT = path.join(process.cwd(), "..");
const OUT = path.join(ROOT, "bakeoff-out", "rendered-pdfs");
const APP = {
  key: "playsimple",
  id: "91637eb3-a7ed-4633-a087-99a4a20986b3",
  company: "PlaySimple Games",
  role: "Product Manager",
};

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

function readJson<T>(filePath: string): T {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text) as T;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function resolveSlotReplacement(
  slot: DocSlot,
  tailored: ResumeContent,
): string | null {
  switch (slot.section) {
    case "headline":
      return tailored.headline ?? null;
    case "experience": {
      if (slot.experience_index === undefined || slot.bullet_index === undefined)
        return null;
      return (
        tailored.experience[slot.experience_index]?.bullets[slot.bullet_index] ??
        null
      );
    }
    case "project": {
      if (slot.project_index === undefined || slot.bullet_index === undefined)
        return null;
      return (
        tailored.projects[slot.project_index]?.bullets[slot.bullet_index] ?? null
      );
    }
    case "skill":
      if (slot.skill_index === undefined) return null;
      return tailored.skills[slot.skill_index] ?? null;
    default:
      return null;
  }
}

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT, { recursive: true });
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [profile] = await sql`
    SELECT full_name, drive_root_id FROM profiles WHERE user_id = ${USER_ID}
  `;
  const [masterResume] = await sql`
    SELECT doc_id, doc_layout FROM master_resume WHERE user_id = ${USER_ID}
  `;
  await sql.end();

  if (!profile?.drive_root_id) throw new Error("drive_root_id missing");
  if (!masterResume?.doc_id || !masterResume.doc_layout)
    throw new Error("Master resume missing");

  const fullName = String(profile.full_name || "Candidate").trim();
  const resumeLayout = (
    typeof masterResume.doc_layout === "string"
      ? JSON.parse(masterResume.doc_layout)
      : masterResume.doc_layout
  ) as DocLayoutMap;

  const tailored = readJson<ResumeContent>(
    path.join(ROOT, "bakeoff-out/playsimple/resume_full.json"),
  );

  const auth = await getGoogleAuthClient(USER_ID);
  const drive = new DriveClient(auth);
  const docs = new DocsClient(auth);
  const rootId = String(profile.drive_root_id);
  const folderName = `${APP.company} - ${APP.role}`.replace(
    /[\\/:*?"<>|]/g,
    "-",
  );
  const appFolderId = await drive.ensureFolder(folderName, rootId);

  const resumeBase = sanitizeFilename(
    `${fullName.split(/\s+/)[0]}_${fullName.split(/\s+/).slice(-1)[0]}_Resume_${APP.company}_${APP.role}`,
  );
  const resumeDocName = `${resumeBase}_v${VERSION}_GemmaBakeoff`;
  const resumePdfName = `${resumeDocName}.pdf`;
  const resumeDocId = await drive.copyFile(
    String(masterResume.doc_id),
    resumeDocName,
    appFolderId,
  );
  const resumeEdits = resumeLayout.slots
    .map((slot) => {
      const replacement = resolveSlotReplacement(slot, tailored);
      if (replacement == null) return null;
      if (replacement.trim() === slot.original.trim()) return null;
      return { original: slot.original, replacement };
    })
    .filter(Boolean) as Array<{ original: string; replacement: string }>;
  await docs.batchUpdate(resumeDocId, buildReplaceRequests(resumeEdits));
  const resumeDocAfter = await docs.getDocument(resumeDocId);
  await docs.batchUpdate(
    resumeDocId,
    buildSkillCategoryBoldRequests(resumeDocAfter, tailored.skills),
  );
  const resumePdfBuf = await drive.exportAsPdf(resumeDocId);
  await drive.uploadFile(
    resumePdfBuf,
    resumePdfName,
    "application/pdf",
    appFolderId,
  );
  const resumeLocal = path.join(OUT, `playsimple__resume__gemma_v${VERSION}.pdf`);
  fs.writeFileSync(resumeLocal, resumePdfBuf);
  console.log("wrote", resumeLocal, resumePdfBuf.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
