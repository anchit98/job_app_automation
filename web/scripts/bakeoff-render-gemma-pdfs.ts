/**
 * Render Gemma bakeoff resume + cover letter JSON through the real Google Docs
 * template path and download PDFs locally (CLI-safe; no Next request cookies).
 *
 * Usage (from web/): npx tsx scripts/bakeoff-render-gemma-pdfs.ts
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { DriveClient } from "../src/lib/google/drive";
import {
  DocsClient,
  buildReplaceRequests,
  buildSkillCategoryBoldRequests,
  buildMetricBoldRequests,
  type DocLayoutMap,
  type DocSlot,
} from "../src/lib/google/docs";
import { getGoogleAuthClient } from "../src/lib/google/tokens";
import {
  buildCoverLetterGreeting,
  buildCoverLetterSignoff,
  mapContentToBodyParagraphs,
  type CoverLetterLayoutMap,
} from "../src/lib/cover-letter/master-sync";
import { normalizeCoverLetterContent } from "../src/lib/cover-letter/normalize";
import type { ResumeContent } from "../src/lib/resume/fabrication";
import type { CoverLetterContent } from "../src/lib/cover-letter/validate";

const USER_ID = "ca7513be-4b5c-43a7-81f0-e98052689b6e";
const VERSION = 903;

const ROOT = path.join(process.cwd(), "..");
const RAW = path.join(ROOT, "bakeoff-out", "raw");
const OUT = path.join(ROOT, "bakeoff-out", "rendered-pdfs");

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

const APPS = [
  {
    key: "miq",
    id: "0b94937a-4e41-49cf-971f-c8962c5e38ff",
    company: "MiQ",
    role: "Product Manager, Intelligence",
  },
  {
    key: "govpreneurs",
    id: "7ed22488-b29c-4623-80ee-2127cf168107",
    company: "Govpreneurs",
    role: "Product Manager",
  },
] as const;

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
  const [masterCover] = await sql`
    SELECT doc_id, doc_layout FROM master_cover_letter WHERE user_id = ${USER_ID}
  `;
  await sql.end();

  if (!profile?.drive_root_id) throw new Error("profiles.drive_root_id missing");
  if (!masterResume?.doc_id || !masterResume.doc_layout)
    throw new Error("Master resume missing");
  if (!masterCover?.doc_id || !masterCover.doc_layout)
    throw new Error("Master cover letter missing");

  const fullName = String(profile.full_name || "Anchit Boruah").trim();
  const resumeLayout = (
    typeof masterResume.doc_layout === "string"
      ? JSON.parse(masterResume.doc_layout)
      : masterResume.doc_layout
  ) as DocLayoutMap;
  const coverLayout = (
    typeof masterCover.doc_layout === "string"
      ? JSON.parse(masterCover.doc_layout)
      : masterCover.doc_layout
  ) as CoverLetterLayoutMap;

  console.log("Auth + Drive…");
  const auth = await getGoogleAuthClient(USER_ID);
  const drive = new DriveClient(auth);
  const docs = new DocsClient(auth);
  const rootId = String(profile.drive_root_id);

  const manifest: Array<Record<string, string | number>> = [];

  for (const app of APPS) {
    const folderName = `${app.company} - ${app.role}`.replace(
      /[\\/:*?"<>|]/g,
      "-",
    );
    const appFolderId = await drive.ensureFolder(folderName, rootId);

    const tailored = readJson<ResumeContent>(
      path.join(RAW, `${app.key}__resume__google_gemma-4-31b-it.json`),
    );
    const cover = readJson<CoverLetterContent>(
      path.join(RAW, `${app.key}__cover_letter__google_gemma-4-31b-it.json`),
    );

    // --- Resume (same path as generateResumeFromDoc) ---
    console.log(`\n>>> Resume ${app.company}`);
    const resumeBase = sanitizeFilename(
      `${fullName.split(/\s+/)[0]}_${fullName.split(/\s+/).slice(-1)[0]}_Resume_${app.company}_${app.role}`,
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
    const resumePdfId = await drive.uploadFile(
      resumePdfBuf,
      resumePdfName,
      "application/pdf",
      appFolderId,
    );
    const resumeLocal = path.join(
      OUT,
      `${app.key}__resume__gemma_v${VERSION}.pdf`,
    );
    fs.writeFileSync(resumeLocal, resumePdfBuf);
    console.log("  wrote", resumeLocal, resumePdfBuf.length, "bytes");
    manifest.push({
      app: app.key,
      kind: "resume",
      local: resumeLocal,
      bytes: resumePdfBuf.length,
      drive_pdf_id: resumePdfId,
      name: resumePdfName,
    });

    if (process.argv.includes("--with-cover-letters")) {
      // --- Cover letter (same path as generateCoverLetterArtifacts) ---
      console.log(`>>> Cover letter ${app.company}`);
      const coverBase = sanitizeFilename(
        `${fullName.split(/\s+/)[0]}_${fullName.split(/\s+/).slice(-1)[0]}_Cover_Letter_${app.company}_${app.role}`,
      );
      const coverDocName = `${coverBase}_v${VERSION}_GemmaBakeoff`;
      const coverPdfName = `${coverDocName}.pdf`;
      const coverDocId = await drive.copyFile(
        String(masterCover.doc_id),
        coverDocName,
        appFolderId,
      );
      const normalized = normalizeCoverLetterContent(cover);
      const bodyParagraphs = mapContentToBodyParagraphs(normalized);
      const greeting = buildCoverLetterGreeting(
        app.company,
        coverLayout.greeting.original,
      );
      const signoff = buildCoverLetterSignoff(
        fullName,
        coverLayout.signoff.original,
      );
      const coverEdits = [
        { original: coverLayout.greeting.original, replacement: greeting },
        ...coverLayout.body_slots.map((slot, i) => ({
          original: slot.original,
          replacement: bodyParagraphs[i] ?? "",
        })),
        { original: coverLayout.signoff.original, replacement: signoff },
      ];
      await docs.batchUpdate(coverDocId, buildReplaceRequests(coverEdits));
      const coverDocAfter = await docs.getDocument(coverDocId);
      const boldRequests = buildMetricBoldRequests(coverDocAfter);
      if (boldRequests.length > 0) {
        await docs.batchUpdate(coverDocId, boldRequests);
      }
      const coverPdfBuf = await drive.exportAsPdf(coverDocId);
      const coverPdfId = await drive.uploadFile(
        coverPdfBuf,
        coverPdfName,
        "application/pdf",
        appFolderId,
      );
      const coverLocal = path.join(
        OUT,
        `${app.key}__cover_letter__gemma_v${VERSION}.pdf`,
      );
      fs.writeFileSync(coverLocal, coverPdfBuf);
      console.log("  wrote", coverLocal, coverPdfBuf.length, "bytes");
      manifest.push({
        app: app.key,
        kind: "cover_letter",
        local: coverLocal,
        bytes: coverPdfBuf.length,
        drive_pdf_id: coverPdfId,
        name: coverPdfName,
      });
    }
  }

  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log("\nDone. PDFs in", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
