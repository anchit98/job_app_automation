"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { upsertMasterCoverLetterRow } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { DocsClient } from "@/lib/google/docs";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { syncMasterCoverLetterFromDoc } from "@/lib/cover-letter/master-sync";

interface SyncResult {
  ok: boolean;
  body_slots: number;
  synced_at: string;
}

export async function syncCoverLetterFromGoogleDoc(
  docIdInput?: string,
): Promise<SyncResult> {
  const docId = (docIdInput ?? env.coverLetterMasterDocId()).trim();
  if (!docId) {
    throw new Error(
      "No cover letter Google Doc ID configured. Set COVER_LETTER_MASTER_DOC_ID in .env.local or pass the doc ID explicitly.",
    );
  }

  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);
  const layout = await syncMasterCoverLetterFromDoc(docs, docId);
  const templateDocId = await drive.ensureCoverLetterTemplateCopy(docId);

  const syncedAt = new Date().toISOString();
  await upsertMasterCoverLetterRow({
    doc_id: templateDocId,
    doc_layout: layout as unknown as Record<string, unknown>,
    doc_synced_at: syncedAt,
  });

  await writeAuditLog("master_cover_letter.doc_synced", "master_cover_letter", "1", {
    source_doc_id: docId,
    template_doc_id: templateDocId,
    body_slot_count: layout.body_slots.length,
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");

  return {
    ok: true,
    body_slots: layout.body_slots.length,
    synced_at: syncedAt,
  };
}
