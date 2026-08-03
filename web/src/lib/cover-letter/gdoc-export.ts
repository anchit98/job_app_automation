import { DriveClient } from "@/lib/google/drive";
import { DocsClient, buildMetricBoldRequests, buildReplaceRequests } from "@/lib/google/docs";
import type { CoverLetterContent } from "@/lib/cover-letter/validate";
import {
  buildCoverLetterGreeting,
  buildCoverLetterSignoff,
  mapContentToBodyParagraphs,
  type CoverLetterLayoutMap,
} from "@/lib/cover-letter/master-sync";
import { normalizeCoverLetterContent } from "@/lib/cover-letter/normalize";

export interface CoverLetterExportInput {
  masterDocId: string;
  layout: CoverLetterLayoutMap;
  content: CoverLetterContent;
  application: {
    id: string;
    company: string | null;
    role: string | null;
  };
  version: number;
  fullName: string;
}

export interface CoverLetterExportResult {
  drive_doc_id: string;
  drive_pdf_id: string;
  drive_docx_id: string;
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
  application: CoverLetterExportInput["application"],
): string {
  const first = fullName.split(/\s+/)[0] || "Cover";
  const last = fullName.split(/\s+/).slice(-1)[0] || "";
  const company = (application.company || "Company").trim();
  const role = (application.role || "Role").trim();
  return sanitizeFilename(`${first}_${last}_Cover_Letter_${company}_${role}`);
}

/**
 * Copy master cover letter Google Doc → replace greeting/body/sign-off slots → export PDF + DOCX.
 */
export async function generateCoverLetterArtifacts(
  drive: DriveClient,
  docs: DocsClient,
  input: CoverLetterExportInput,
): Promise<CoverLetterExportResult> {
  const applicationFolderId = await drive.ensureApplicationFolder(input.application);
  const base = buildFileBaseName(input.fullName, input.application);
  const docName = `${base}_v${input.version}`;
  const pdfName = `${docName}.pdf`;
  const docxName = `${docName}.docx`;

  const copiedDocId = await drive.copyFile(
    input.masterDocId,
    docName,
    applicationFolderId,
  );

  const normalizedContent = normalizeCoverLetterContent(input.content);
  const bodyParagraphs = mapContentToBodyParagraphs(normalizedContent);
  const greeting = buildCoverLetterGreeting(
    input.application.company,
    input.layout.greeting.original,
  );
  const signoff = buildCoverLetterSignoff(
    input.fullName,
    input.layout.signoff.original,
  );

  const edits: Array<{ original: string; replacement: string }> = [
    { original: input.layout.greeting.original, replacement: greeting },
    ...input.layout.body_slots.map((slot, i) => ({
      original: slot.original,
      replacement: bodyParagraphs[i] ?? "",
    })),
    { original: input.layout.signoff.original, replacement: signoff },
  ];

  const nameOriginal = input.layout.signoff.name_original?.trim();
  if (nameOriginal) {
    edits.push({ original: nameOriginal, replacement: input.fullName });
  }

  await docs.batchUpdate(copiedDocId, buildReplaceRequests(edits));

  const docAfterReplace = await docs.getDocument(copiedDocId);
  const boldRequests = buildMetricBoldRequests(docAfterReplace);
  if (boldRequests.length > 0) {
    await docs.batchUpdate(copiedDocId, boldRequests);
  }

  const pdfBuffer = await drive.exportAsPdf(copiedDocId);
  const drivePdfId = await drive.uploadFile(
    pdfBuffer,
    pdfName,
    "application/pdf",
    applicationFolderId,
  );

  const docxBuffer = await drive.exportAsDocx(copiedDocId);
  const driveDocxId = await drive.uploadFile(
    docxBuffer,
    docxName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    applicationFolderId,
  );

  return {
    drive_doc_id: copiedDocId,
    drive_pdf_id: drivePdfId,
    drive_docx_id: driveDocxId,
    pdf_name: pdfName,
  };
}
