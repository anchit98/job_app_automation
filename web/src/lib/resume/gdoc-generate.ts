import { DriveClient } from "@/lib/google/drive";
import {
  DocsClient,
  buildReplaceRequests,
  buildSkillCategoryBoldRequests,
  DocLayoutMap,
  DocSlot,
} from "@/lib/google/docs";
import type { ResumeContent } from "@/lib/resume/fabrication";

export interface GdocGenerationInput {
  masterDocId: string;
  layout: DocLayoutMap;
  tailored: ResumeContent;
  application: {
    id: string;
    company: string | null;
    role: string | null;
  };
  version: number;
  fullName: string;
}

export interface GdocGenerationResult {
  drive_doc_id: string;
  /** Null when the caller asked to skip the PDF export. */
  drive_pdf_id: string | null;
  pdf_name: string;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildFileBaseName(
  fullName: string,
  application: GdocGenerationInput["application"],
): string {
  const first = fullName.split(/\s+/)[0] || "Resume";
  const last = fullName.split(/\s+/).slice(-1)[0] || "";
  const company = (application.company || "Company").trim();
  const role = (application.role || "Role").trim();
  return sanitizeFilename(`${first}_${last}_Resume_${company}_${role}`);
}

function slotEdits(
  layout: DocLayoutMap,
  tailored: ResumeContent,
): Array<{ original: string; replacement: string }> {
  const edits: Array<{ original: string; replacement: string }> = [];

  for (const slot of layout.slots) {
    const replacement = resolveSlotReplacement(slot, tailored);
    if (replacement === null || replacement === undefined) continue;
    if (replacement.trim() === slot.original.trim()) continue;
    edits.push({ original: slot.original, replacement });
  }

  return edits;
}

function resolveSlotReplacement(
  slot: DocSlot,
  tailored: ResumeContent,
): string | null {
  switch (slot.section) {
    case "headline":
      return tailored.headline ?? null;
    case "experience": {
      if (
        slot.experience_index === undefined ||
        slot.bullet_index === undefined
      )
        return null;
      const exp = tailored.experience[slot.experience_index];
      return exp?.bullets[slot.bullet_index] ?? null;
    }
    case "project": {
      if (
        slot.project_index === undefined ||
        slot.bullet_index === undefined
      )
        return null;
      const p = tailored.projects[slot.project_index];
      return p?.bullets[slot.bullet_index] ?? null;
    }
    case "skill":
      if (slot.skill_index === undefined) return null;
      return tailored.skills[slot.skill_index] ?? null;
    default:
      return null;
  }
}

/**
 * Copy master doc → replace slot text → export as PDF → upload PDF alongside the doc.
 */
export async function generateResumeFromDoc(
  drive: DriveClient,
  docs: DocsClient,
  input: GdocGenerationInput,
  options?: {
    /** Fires once the Doc holds the final text, before the slower PDF work. */
    onDocReady?: (driveDocId: string) => Promise<void>;
    /**
     * Skip exporting and uploading the Doc as a PDF.
     *
     * The downloadable PDF is typeset from LaTeX now; this Doc exists so the
     * user can open their own layout and edit it. Exporting it as well would
     * be two more Google round trips for a file nothing links to.
     */
    skipPdf?: boolean;
  },
): Promise<GdocGenerationResult> {
  const applicationFolderId = await drive.ensureApplicationFolder(input.application);
  const base = buildFileBaseName(input.fullName, input.application);
  const docName = `${base}_v${input.version}`;
  const pdfName = `${docName}.pdf`;

  const copiedDocId = await drive.copyFile(
    input.masterDocId,
    docName,
    applicationFolderId,
  );

  const edits = slotEdits(input.layout, input.tailored);
  const requests = buildReplaceRequests(edits);
  if (requests.length > 0) {
    await docs.batchUpdate(copiedDocId, requests);
  }

  // replaceAllText inherits bold from "Category:" onto the whole skill line -
  // re-apply bold only on the header, plain text after the colon.
  // Skip the extra Docs fetch when skills have no Category: prefixes.
  const needsSkillStyle = input.tailored.skills.some((line) =>
    line.includes(":"),
  );
  if (needsSkillStyle) {
    const docAfterReplace = await docs.getDocument(copiedDocId);
    const skillStyleRequests = buildSkillCategoryBoldRequests(
      docAfterReplace,
      input.tailored.skills,
    );
    if (skillStyleRequests.length > 0) {
      await docs.batchUpdate(copiedDocId, skillStyleRequests);
    }
  }

  // Everything above this line decides what the resume says; everything
  // below is just turning it into a PDF file on Drive. The caller can start
  // offering the download now.
  if (options?.onDocReady) await options.onDocReady(copiedDocId);

  if (options?.skipPdf) {
    return { drive_doc_id: copiedDocId, drive_pdf_id: null, pdf_name: pdfName };
  }

  const pdfBuffer = await drive.exportAsPdf(copiedDocId);
  const drivePdfId = await drive.uploadFile(
    pdfBuffer,
    pdfName,
    "application/pdf",
    applicationFolderId,
  );

  return {
    drive_doc_id: copiedDocId,
    drive_pdf_id: drivePdfId,
    pdf_name: pdfName,
  };
}
