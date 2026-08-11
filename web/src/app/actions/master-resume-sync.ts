"use server";

import { revalidatePath } from "next/cache";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { DocsClient } from "@/lib/google/docs";
import {
  explainGoogleDocFetchError,
  resolveGoogleDocsId,
} from "@/lib/google/docs-url";
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
  content: Record<string, unknown>;
  /** heuristic = fast local parse; smart_agent = OpenAI template mapper */
  sync_mode?: "heuristic" | "smart_agent";
  signature_fields?: {
    phone: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    portfolio_url: string | null;
  } | null;
}

/**
 * Pull the master Google Doc content into DB. Called on-demand when the user
 * updates their master doc.
 */
export async function syncMasterFromGoogleDoc(
  docIdInput?: string,
): Promise<SyncResult> {
  const raw = (docIdInput ?? env.resumeMasterDocId()).trim();
  if (!raw) {
    throw new Error(
      "No master Google Doc configured. Paste a docs.google.com/document/... link.",
    );
  }
  const parsed = resolveGoogleDocsId(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const docId = parsed.docId;

  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);
  let synced: Awaited<ReturnType<typeof syncMasterResumeFromDoc>>;
  let templateDocId: string;
  try {
    await drive.assertReadableGoogleDoc(docId);
    synced = await syncMasterResumeFromDoc(docs, docId);
    templateDocId = await drive.ensureMasterTemplateCopy(docId);
  } catch (error) {
    throw new Error(explainGoogleDocFetchError(error));
  }
  const { content, layout, sync_mode } = synced;

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
    sync_mode: sync_mode ?? "heuristic",
  });

  const { syncSignatureLinksFromResume } = await import("@/app/actions/profile");
  const links = await syncSignatureLinksFromResume({ overwrite: true }).catch(
    () => null,
  );

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
    // Keep payload small for Server Action → client; full content is reloaded
    // via router.refresh() / getMasterResume on the onboarding page.
    content: content as unknown as Record<string, unknown>,
    sync_mode: sync_mode ?? "heuristic",
    signature_fields: links?.ok ? links.fields : null,
  };
}
