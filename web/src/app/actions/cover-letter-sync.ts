"use server";

import { writeAuditLog } from "@/lib/audit";
import { upsertMasterCoverLetterRow } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { DocsClient } from "@/lib/google/docs";
import {
  explainGoogleDocFetchError,
  resolveGoogleDocsId,
} from "@/lib/google/docs-url";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { syncMasterCoverLetterFromDoc } from "@/lib/cover-letter/master-sync";

type SyncSuccess = {
  ok: true;
  body_slots: number;
  synced_at: string;
};

type SyncFailure = { ok: false; error: string };

export type SyncCoverLetterResult = SyncSuccess | SyncFailure;

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
    let layout: Awaited<ReturnType<typeof syncMasterCoverLetterFromDoc>>;
    let templateDocId: string;
    try {
      await drive.assertReadableGoogleDoc(docId);
      layout = await syncMasterCoverLetterFromDoc(docs, docId);
      templateDocId = await drive.ensureCoverLetterTemplateCopy(docId);
    } catch (error) {
      console.error("[cover-letter-sync] google doc failed:", error);
      return { ok: false, error: explainGoogleDocFetchError(error) };
    }

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
        source_doc_id: docId,
        template_doc_id: templateDocId,
        body_slot_count: layout.body_slots.length,
      },
    );

    return {
      ok: true,
      body_slots: layout.body_slots.length,
      synced_at: syncedAt,
    };
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
