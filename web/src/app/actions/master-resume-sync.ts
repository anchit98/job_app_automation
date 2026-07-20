"use server";

import { revalidatePath } from "next/cache";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { DocsClient } from "@/lib/google/docs";
import { DriveClient } from "@/lib/google/drive";
import { upsertMasterResumeRow } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { syncMasterResumeFromDoc } from "@/lib/resume/master-sync";
import { writeAuditLog } from "@/lib/audit";

interface SyncResult {
  ok: boolean;
  slots: number;
  headline: string;
  experience_roles: number;
  projects: number;
  skills: number;
  education: number;
  synced_at: string;
}

/**
 * Pull the master Google Doc content into DB. Called on-demand when the user
 * updates their master doc.
 */
export async function syncMasterFromGoogleDoc(
  docIdInput?: string,
): Promise<SyncResult> {
  const docId = (docIdInput ?? env.resumeMasterDocId()).trim();
  if (!docId) {
    throw new Error(
      "No master Google Doc ID configured. Set RESUME_MASTER_DOC_ID in .env.local or pass the doc ID explicitly.",
    );
  }

  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);
  const { content, layout } = await syncMasterResumeFromDoc(docs, docId);
  const templateDocId = await drive.ensureMasterTemplateCopy(docId);

  const syncedAt = new Date().toISOString();
  await upsertMasterResumeRow({
    content: content as unknown as Record<string, unknown>,
    doc_id: templateDocId,
    doc_layout: layout as unknown as Record<string, unknown>,
    doc_synced_at: syncedAt,
  });

  await writeAuditLog("master_resume.doc_synced", "master_resume", "1", {
    source_doc_id: docId,
    template_doc_id: templateDocId,
    slot_count: layout.slots.length,
  });

  const { syncSignatureLinksFromResume } = await import("@/app/actions/profile");
  await syncSignatureLinksFromResume({ overwrite: true }).catch(() => null);

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");

  return {
    ok: true,
    slots: layout.slots.length,
    headline: content.headline,
    experience_roles: content.experience.length,
    projects: content.projects.length,
    skills: content.skills.length,
    education: content.education.length,
    synced_at: syncedAt,
  };
}
