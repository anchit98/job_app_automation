"use server";

import { writeAuditLog } from "@/lib/audit";
import { upsertMasterCoverLetterRow } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { DocsClient, extractParagraphText } from "@/lib/google/docs";
import {
  explainGoogleDocFetchError,
  resolveGoogleDocsId,
} from "@/lib/google/docs-url";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { syncMasterCoverLetterFromDoc } from "@/lib/cover-letter/master-sync";
import { normalizeConvertedCoverLetterParagraphs } from "@/lib/cover-letter/pdf-doc-normalize";
import { requireUser } from "@/lib/auth/user";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const MAX_COVER_LETTER_BYTES = 8_000_000;
const IMPORTED_DOC_NAME = "Imported Cover Letter";

type ImportableMime = typeof PDF_MIME | typeof DOCX_MIME | typeof DOC_MIME;

function detectImportableMime(
  declaredMime: string,
  fileName: string,
): ImportableMime | null {
  const name = fileName.toLowerCase();
  if (declaredMime === PDF_MIME || name.endsWith(".pdf")) return PDF_MIME;
  if (declaredMime === DOCX_MIME || name.endsWith(".docx")) return DOCX_MIME;
  if (declaredMime === DOC_MIME || name.endsWith(".doc")) return DOC_MIME;
  return null;
}

type SyncSuccess = {
  ok: true;
  body_slots: number;
  synced_at: string;
};

type SyncFailure = { ok: false; error: string };

export type SyncCoverLetterResult = SyncSuccess | SyncFailure;

export type SyncCoverLetterFromFileResult =
  | (SyncSuccess & {
      /** Converted Doc the user can open and correct before re-syncing. */
      converted_doc_id: string;
      converted_doc_url: string;
    })
  | SyncFailure;

/**
 * Shared tail of every entry point: read the Doc, snapshot it as the app-owned
 * template, persist, audit. `sourceDocId` must be a readable Google Doc.
 */
async function syncFromReadableCoverDoc(
  docs: DocsClient,
  drive: DriveClient,
  sourceDocId: string,
  auditExtra: Record<string, unknown> = {},
): Promise<SyncSuccess> {
  const layout = await syncMasterCoverLetterFromDoc(docs, sourceDocId);
  const templateDocId = await drive.ensureCoverLetterTemplateCopy(sourceDocId);

  const syncedAt = new Date().toISOString();
  await upsertMasterCoverLetterRow({
    doc_id: templateDocId,
    doc_layout: layout as unknown as Record<string, unknown>,
    doc_synced_at: syncedAt,
  });

  await writeAuditLog(
    "master_cover_letter.doc_synced",
    "master_cover_letter",
    "1",
    {
      source_doc_id: sourceDocId,
      template_doc_id: templateDocId,
      body_slot_count: layout.body_slots.length,
      ...auditExtra,
    },
  );

  return {
    ok: true,
    body_slots: layout.body_slots.length,
    synced_at: syncedAt,
  };
}

/**
 * Returns `{ ok:false, error }` instead of throwing — production digests
 * thrown Server Action errors into an opaque RSC message.
 */
export async function syncCoverLetterFromGoogleDoc(
  docIdInput?: string,
): Promise<SyncCoverLetterResult> {
  try {
    const raw = (docIdInput ?? env.coverLetterMasterDocId()).trim();
    if (!raw) {
      return {
        ok: false,
        error:
          "No cover letter Google Doc configured. Use Choose from Drive to pick a Doc.",
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
      return await syncFromReadableCoverDoc(docs, drive, docId);
    } catch (error) {
      console.error("[cover-letter-sync] google doc failed:", error);
      return { ok: false, error: explainGoogleDocFetchError(error) };
    }
  } catch (error) {
    console.error("[cover-letter-sync] unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Cover letter sync failed. Try Choose from Drive again.",
    };
  }
}

/**
 * Convert cover letter bytes into an editable Google Doc, then sync.
 *
 * Apply copies the template Doc and swaps paragraph text with replaceAllText,
 * so a PDF or .docx can never be the template directly. The converted Doc is
 * kept so the user can fix conversion artifacts and re-sync.
 */
async function importCoverLetterBytesAndSync(
  buffer: Buffer,
  sourceMime: ImportableMime,
  displayName: string,
  auditExtra: Record<string, unknown>,
): Promise<SyncCoverLetterFromFileResult> {
  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);

  let convertedDocId: string;
  try {
    // Own folder, not `_Master` — that one is for the app's templates, which
    // ensureCoverLetterTemplateCopy deletes and replaces by name.
    const importsFolderId = await drive.ensureImportedResumeFolder();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const base = (displayName || "").replace(/\.(pdf|docx?)$/i, "").trim();
    convertedDocId = await drive.importFileAsGoogleDoc(
      buffer,
      base
        ? `${base} (imported ${stamp})`
        : `${IMPORTED_DOC_NAME} ${stamp}`,
      importsFolderId,
      sourceMime,
    );

    // A converted letter keeps its letterhead (name, contact row, date,
    // recipient address) and sometimes a footer. The sync reads paragraph 0 as
    // the greeting, so trim to greeting → body → sign-off before syncing.
    const converted = await docs.getDocument(convertedDocId);
    const normalized = normalizeConvertedCoverLetterParagraphs(
      extractParagraphText(converted),
    );
    if (normalized.length > 0) {
      await docs.rewriteBody(
        convertedDocId,
        normalized.map((text) => ({ text, bullet: false })),
      );
    }
  } catch (error) {
    console.error("[cover-letter-sync] file conversion failed:", error);
    return { ok: false, error: explainGoogleDocFetchError(error) };
  }

  try {
    const result = await syncFromReadableCoverDoc(docs, drive, convertedDocId, {
      ...auditExtra,
      source_mime: sourceMime,
      source_bytes: buffer.length,
      source_name: displayName || null,
    });
    return {
      ...result,
      converted_doc_id: convertedDocId,
      converted_doc_url: `https://docs.google.com/document/d/${convertedDocId}/edit`,
    };
  } catch (error) {
    console.error("[cover-letter-sync] converted doc sync failed:", error);
    // The Doc exists and is editable even when the paragraph shape is off —
    // send the user there instead of dropping the conversion silently.
    return {
      ok: false,
      error: `${explainGoogleDocFetchError(error)} Your file was converted to a Google Doc (${IMPORTED_DOC_NAME}) in Drive — open it, fix the paragraphs, then sync again.`,
    };
  }
}

/** Accept a cover letter from the user's device: PDF, .docx or .doc. */
export async function syncCoverLetterFromUpload(
  formData: FormData,
): Promise<SyncCoverLetterFromFileResult> {
  try {
    await requireUser();

    const file = formData.get("cover_letter_file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a PDF or Word file to upload." };
    }
    const sourceMime = detectImportableMime(file.type, file.name || "");
    if (!sourceMime) {
      return {
        ok: false,
        error:
          "Unsupported file. Choose a PDF, .docx or .doc — or pick a Google Doc from Drive.",
      };
    }
    if (file.size > MAX_COVER_LETTER_BYTES) {
      return {
        ok: false,
        error: `That file is ${(file.size / 1_000_000).toFixed(1)} MB. Choose a cover letter under ${MAX_COVER_LETTER_BYTES / 1_000_000} MB.`,
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

    return await importCoverLetterBytesAndSync(
      buffer,
      sourceMime,
      file.name || "",
      { source: "device_upload" },
    );
  } catch (error) {
    console.error("[cover-letter-sync] device upload unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Upload failed. Try again.",
    };
  }
}

/**
 * Sync from a file picked in Google Drive. A Google Doc syncs directly; a PDF
 * or Word file is downloaded and converted first, like a device upload.
 */
export async function syncCoverLetterFromDriveFile(
  fileId: string,
  mimeType: string,
): Promise<SyncCoverLetterFromFileResult> {
  try {
    await requireUser();
    if (!fileId?.trim()) {
      return { ok: false, error: "No file selected." };
    }

    if (mimeType === GOOGLE_DOC_MIME) {
      const result = await syncCoverLetterFromGoogleDoc(fileId);
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
          "Pick a Google Doc, PDF or Word file. Sheets, slides and images cannot be cover letters.",
      };
    }

    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    let buffer: Buffer;
    try {
      // drive.file covers files the user just granted through the Picker.
      buffer = await drive.getFile(fileId);
    } catch (error) {
      console.error("[cover-letter-sync] drive download failed:", error);
      return { ok: false, error: explainGoogleDocFetchError(error) };
    }
    if (buffer.length > MAX_COVER_LETTER_BYTES) {
      return {
        ok: false,
        error: `That file is ${(buffer.length / 1_000_000).toFixed(1)} MB. Choose a cover letter under ${MAX_COVER_LETTER_BYTES / 1_000_000} MB.`,
      };
    }

    return await importCoverLetterBytesAndSync(buffer, sourceMime, "", {
      source: "drive_picker_file",
      drive_file_id: fileId,
    });
  } catch (error) {
    console.error("[cover-letter-sync] drive file sync unexpected:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Drive sync failed. Try again.",
    };
  }
}
