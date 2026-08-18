"use server";

import { getGoogleAuthClient } from "@/lib/google/tokens";
import { DocsClient } from "@/lib/google/docs";
import {
  explainGoogleDocFetchError,
  resolveGoogleDocsId,
} from "@/lib/google/docs-url";
import { DriveClient } from "@/lib/google/drive";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth/user";
import {
  GOOGLE_DOC_MIME,
  MAX_RESUME_BYTES,
  PDF_MIME,
  detectImportableMime,
  importBytesAndSync,
  syncFromReadableDoc,
  type MasterImportResult,
  type MasterSyncFailure,
  type MasterSyncSuccess,
} from "@/lib/resume/master-import";

export type SyncMasterResult = MasterSyncSuccess | MasterSyncFailure;
export type SyncMasterFromPdfResult = MasterImportResult;

export async function syncMasterFromGoogleDoc(
  docIdInput?: string,
): Promise<SyncMasterResult> {
  try {
    const raw = (docIdInput ?? env.resumeMasterDocId()).trim();
    if (!raw) {
      return {
        ok: false,
        error:
          "No master Google Doc configured. Use Choose from Drive to pick a Doc.",
      };
    }
    const parsed = resolveGoogleDocsId(raw);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    const docId = parsed.docId;

    const auth = await getGoogleAuthClient();
    const docs = new DocsClient(auth);
    const drive = new DriveClient(auth);

    try {
      await drive.assertReadableGoogleDoc(docId);
      return await syncFromReadableDoc(docs, drive, docId);
    } catch (error) {
      console.error("[master-resume-sync] google doc failed:", error);
      return { ok: false, error: explainGoogleDocFetchError(error) };
    }
  } catch (error) {
    console.error("[master-resume-sync] unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Resume sync failed. Try Choose from Drive again.",
    };
  }
}

/** Accept a resume from the user's device: PDF, .docx or .doc. */
export async function syncMasterFromPdfUpload(
  formData: FormData,
): Promise<SyncMasterFromPdfResult> {
  try {
    await requireUser();

    const file = formData.get("resume_pdf");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a PDF or Word file to upload." };
    }
    // Browsers sometimes report an empty type for drag-and-drop files, so the
    // extension is checked too rather than rejecting a valid resume.
    const sourceMime = detectImportableMime(file.type, file.name || "");
    if (!sourceMime) {
      return {
        ok: false,
        error:
          "Unsupported file. Choose a PDF, .docx or .doc — or pick a Google Doc from Drive.",
      };
    }
    if (file.size > MAX_RESUME_BYTES) {
      return {
        ok: false,
        error: `That file is ${(file.size / 1_000_000).toFixed(1)} MB. Choose a resume under ${MAX_RESUME_BYTES / 1_000_000} MB.`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (
      sourceMime === PDF_MIME &&
      buffer.subarray(0, 5).toString("latin1") !== "%PDF-"
    ) {
      return {
        ok: false,
        error: "That file is not a readable PDF. Re-export it and try again.",
      };
    }

    return await importBytesAndSync(buffer, sourceMime, file.name || "", {
      source: "device_upload",
    });
  } catch (error) {
    console.error("[master-resume-sync] device upload unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Upload failed. Try again.",
    };
  }
}

/**
 * Sync from a file picked in Google Drive.
 *
 * A Google Doc syncs directly; a PDF or Word file picked from Drive is
 * downloaded and converted first, exactly like a device upload.
 */
export async function syncMasterFromDriveFile(
  fileId: string,
  mimeType: string,
): Promise<SyncMasterFromPdfResult> {
  try {
    await requireUser();
    if (!fileId?.trim()) {
      return { ok: false, error: "No file selected." };
    }

    if (mimeType === GOOGLE_DOC_MIME) {
      const result = await syncMasterFromGoogleDoc(fileId);
      if (!result.ok) return result;
      return {
        ...result,
        converted_doc_id: fileId,
        converted_doc_url: `https://docs.google.com/document/d/${fileId}/edit`,
      };
    }

    const sourceMime = detectImportableMime(mimeType, "");
    if (!sourceMime) {
      return {
        ok: false,
        error:
          "Pick a Google Doc, PDF or Word file. Sheets, slides and images cannot be resumes.",
      };
    }

    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    let buffer: Buffer;
    try {
      // drive.file covers files the user just granted through the Picker.
      buffer = await drive.getFile(fileId);
    } catch (error) {
      console.error("[master-resume-sync] drive download failed:", error);
      return { ok: false, error: explainGoogleDocFetchError(error) };
    }
    if (buffer.length > MAX_RESUME_BYTES) {
      return {
        ok: false,
        error: `That file is ${(buffer.length / 1_000_000).toFixed(1)} MB. Choose a resume under ${MAX_RESUME_BYTES / 1_000_000} MB.`,
      };
    }

    return await importBytesAndSync(buffer, sourceMime, "", {
      source: "drive_picker_file",
      drive_file_id: fileId,
    });
  } catch (error) {
    console.error("[master-resume-sync] drive file sync unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Drive sync failed. Try again.",
    };
  }
}
