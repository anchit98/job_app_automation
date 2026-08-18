/**
 * Turn resume bytes into the user's master resume.
 *
 * Apply copies the master Doc and swaps text in place with replaceAllText, so
 * the master must be an editable Google Doc — a PDF or .docx can never be the
 * master directly. Drive converts on import; from there the normal Doc sync
 * runs unchanged.
 *
 * Lives in lib (not the "use server" action file) because three callers share
 * it: device upload, Drive file pick, and the resume builder.
 */
import { DocsClient, extractParagraphText } from "@/lib/google/docs";
import { DriveClient } from "@/lib/google/drive";
import { explainGoogleDocFetchError } from "@/lib/google/docs-url";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { upsertMasterResumeRow } from "@/lib/db/queries";
import { syncMasterResumeFromDoc } from "@/lib/resume/master-sync";
import { normalizeConvertedPdfParagraphs } from "@/lib/resume/pdf-doc-normalize";
import { writeAuditLog } from "@/lib/audit";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOC_MIME = "application/msword";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/** Kept under next.config serverActions.bodySizeLimit. */
export const MAX_RESUME_BYTES = 8_000_000;
export const IMPORTED_DOC_NAME = "Imported Resume";

/** Keeps the original file recognisable and each import distinct. */
function importedDocName(sourceName: string): string {
  const base = sourceName.replace(/\.(pdf|docx?|DOCX?|PDF)$/, "").trim();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return base ? `${base} (imported ${stamp})` : `${IMPORTED_DOC_NAME} ${stamp}`;
}

export type ImportableMime =
  | typeof PDF_MIME
  | typeof DOCX_MIME
  | typeof DOC_MIME;

export function detectImportableMime(
  declaredMime: string,
  fileName: string,
): ImportableMime | null {
  const name = fileName.toLowerCase();
  if (declaredMime === PDF_MIME || name.endsWith(".pdf")) return PDF_MIME;
  if (declaredMime === DOCX_MIME || name.endsWith(".docx")) return DOCX_MIME;
  if (declaredMime === DOC_MIME || name.endsWith(".doc")) return DOC_MIME;
  return null;
}

export type MasterSyncSuccess = {
  ok: true;
  slots: number;
  headline: string;
  experience_roles: number;
  projects: number;
  skills: number;
  education: number;
  synced_at: string;
  content: Record<string, unknown>;
  /** heuristic = fast local parse; smart_agent = OpenAI template mapper */
  sync_mode?: "heuristic" | "smart_agent";
  signature_fields?: {
    phone: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    portfolio_url: string | null;
  } | null;
};

export type MasterSyncFailure = { ok: false; error: string };

export type MasterImportResult =
  | (MasterSyncSuccess & {
      /** Converted Doc the user can open and correct before re-syncing. */
      converted_doc_id: string;
      converted_doc_url: string;
    })
  | MasterSyncFailure;

/**
 * Shared tail of every entry point: read the Doc, snapshot it as the app-owned
 * template, persist, audit. `sourceDocId` must be a readable Google Doc.
 */
export async function syncFromReadableDoc(
  docs: DocsClient,
  drive: DriveClient,
  sourceDocId: string,
  auditExtra: Record<string, unknown> = {},
): Promise<MasterSyncSuccess> {
  const synced = await syncMasterResumeFromDoc(docs, sourceDocId);
  const templateDocId = await drive.ensureMasterTemplateCopy(sourceDocId);
  const { content, layout, sync_mode } = synced;

  const syncedAt = new Date().toISOString();
  await upsertMasterResumeRow({
    content: content as unknown as Record<string, unknown>,
    doc_id: templateDocId,
    doc_layout: layout as unknown as Record<string, unknown>,
    doc_synced_at: syncedAt,
  });

  await writeAuditLog("master_resume.doc_synced", "master_resume", "1", {
    source_doc_id: sourceDocId,
    template_doc_id: templateDocId,
    slot_count: layout.slots.length,
    sync_mode: sync_mode ?? "heuristic",
    ...auditExtra,
  });

  const { syncSignatureLinksFromResume } = await import(
    "@/app/actions/profile"
  );
  // Skip revalidatePath inside signature sync — Flight digest risk.
  const links = await syncSignatureLinksFromResume({
    overwrite: true,
    skipRevalidate: true,
  }).catch(() => null);

  return {
    ok: true,
    slots: layout.slots.length,
    headline: content.headline,
    experience_roles: content.experience.length,
    projects: content.projects.length,
    skills: content.skills.length,
    education: content.education.length,
    synced_at: syncedAt,
    content: content as unknown as Record<string, unknown>,
    sync_mode: sync_mode ?? "heuristic",
    signature_fields: links?.ok ? links.fields : null,
  };
}

/**
 * Convert resume bytes into an editable Google Doc, then run the normal sync.
 *
 * The converted Doc is kept (not a throwaway) so the user can fix conversion
 * artifacts and re-sync.
 */
export async function importBytesAndSync(
  buffer: Buffer,
  sourceMime: ImportableMime,
  displayName: string,
  auditExtra: Record<string, unknown>,
): Promise<MasterImportResult> {
  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);

  let convertedDocId: string;
  try {
    // Its own folder, not the app's `_Master` template folder: the user is
    // told to open and fix these, and a fixed name would stack up identically
    // named copies on every import.
    const importsFolderId = await drive.ensureImportedResumeFolder();
    convertedDocId = await drive.importFileAsGoogleDoc(
      buffer,
      importedDocName(displayName),
      importsFolderId,
      sourceMime,
    );

    // Only PDFs need repair. Drive's PDF import glues each role header and all
    // its bullets into one paragraph with no list formatting, so a three-role
    // resume would parse as one. Word imports keep real paragraphs and bullets
    // already — rebuilding those would throw away good structure.
    if (sourceMime === PDF_MIME) {
      const converted = await docs.getDocument(convertedDocId);
      const normalized = normalizeConvertedPdfParagraphs(
        extractParagraphText(converted),
      );
      if (normalized.length > 0) {
        await docs.rewriteBody(
          convertedDocId,
          normalized.map((line) => ({
            text: line.text,
            bullet: line.kind === "bullet",
          })),
        );
      }
    }
  } catch (error) {
    console.error("[master-import] file conversion failed:", error);
    return { ok: false, error: explainGoogleDocFetchError(error) };
  }

  try {
    const result = await syncFromReadableDoc(docs, drive, convertedDocId, {
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
    console.error("[master-import] converted doc sync failed:", error);
    // The Doc exists and is editable even when parsing fell short — point the
    // user at it instead of silently dropping the conversion.
    return {
      ok: false,
      error: `${explainGoogleDocFetchError(error)} Your file was converted to a Google Doc (${IMPORTED_DOC_NAME}) in Drive — open it, tidy the headings, then sync again.`,
    };
  }
}
