"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { writeAuditLog } from "@/lib/audit";
import { refundCredit, spendCredit } from "@/lib/billing/entitlements";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { generateLatexContent } from "@/lib/builder/latex-engine";
import { buildMasterDoc, builtMasterToSynced } from "@/lib/builder/master-doc";
import {
  getBuilderCvVersion,
  getBuilderProfile,
  insertBuilderCvVersion,
  listBuilderCvVersions,
  markVersionSyncedToMaster,
  upsertBuilderProfile,
} from "@/lib/builder/queries";
import {
  FIELD_LABELS,
  type BuilderProfile,
  type ProfessionalField,
  emptyBuilderProfile,
  isProfessionalField,
} from "@/lib/builder/types";
import { getMasterResumeRow } from "@/lib/db/queries";
import type { MasterResumeSource } from "@/lib/db/types";
import { DocsClient } from "@/lib/google/docs";
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { assertResumeSyncAtsReady } from "@/lib/resume/ats-sync";
import {
  PDF_MIME,
  type MasterImportResult,
  importBytesAndSync,
  syncFromReadableDoc,
} from "@/lib/resume/master-import";

type Failure = { ok: false; error: string };

/** Drive rejects these in file names, and they read badly in a download. */
function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}

/**
 * A CV sitting in Drive should be recognisable without opening it, so the name
 * carries who it is for, which field it targets and when it was made.
 */
function builtCvFileName(profile: BuilderProfile): string {
  return `${builtCvBaseName(profile)}.pdf`;
}

function builtCvBaseName(profile: BuilderProfile): string {
  const who = safeFileName(profile.name?.trim() || "CV");
  const date = new Date().toISOString().slice(0, 10);
  return `${who}_CV_${profile.professional_field}_${date}`;
}

export type LoadBuilderResult = {
  ok: true;
  profile: BuilderProfile;
  versions: Awaited<ReturnType<typeof listBuilderCvVersions>>;
  /** False on a first visit — the UI opens on the industry step instead. */
  has_profile: boolean;
  /** Which route produced the master resume Apply uses right now. */
  master_source: MasterResumeSource | null;
  /** Builder version id when master_source is "builder" — else null. */
  master_source_ref: string | null;
};

/** Everything the builder page needs in one round trip. */
export async function loadBuilder(): Promise<LoadBuilderResult | Failure> {
  try {
    const user = await requireUser();
    const [profile, versions, master] = await Promise.all([
      getBuilderProfile(),
      listBuilderCvVersions(),
      getMasterResumeRow().catch(() => null),
    ]);
    return {
      ok: true,
      profile: profile ?? emptyBuilderProfile(user.full_name ?? ""),
      versions,
      has_profile: Boolean(profile),
      master_source: master?.source ?? null,
      master_source_ref: master?.source_ref ?? null,
    };
  } catch (error) {
    console.error("[builder] load failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load builder.",
    };
  }
}

/** Save the form without spending a credit — generation is the metered step. */
export async function saveBuilderProfile(
  profile: BuilderProfile,
): Promise<{ ok: true } | Failure> {
  try {
    await requireUser();
    if (!profile?.name?.trim()) {
      return { ok: false, error: "Add your name before saving." };
    }
    if (!isProfessionalField(profile.professional_field)) {
      return { ok: false, error: "Choose a professional field." };
    }
    await upsertBuilderProfile(profile);
    revalidatePath("/builder");
    return { ok: true };
  } catch (error) {
    console.error("[builder] save failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}

export type GenerateCvResult =
  | {
      ok: true;
      version_id: string;
      pdf_url: string | null;
      credits_left: number;
    }
  | Failure;

/**
 * Render the profile to a PDF and store it as a new version.
 *
 * The credit is spent before the slow LaTeX/Drive work and refunded if that
 * work fails, so a failed build never silently costs the user a generation.
 */
export async function generateCv(
  profileInput?: BuilderProfile,
): Promise<GenerateCvResult> {
  try {
    await requireUser();

    const profile = profileInput ?? (await getBuilderProfile());
    if (!profile) {
      return { ok: false, error: "Fill in your details before generating." };
    }
    if (!profile.name?.trim()) {
      return { ok: false, error: "Add your name before generating." };
    }
    if (!profile.experience?.length && !profile.education?.length) {
      return {
        ok: false,
        error: "Add at least one education or work experience entry.",
      };
    }

    const spend = await spendCredit("cv");
    if (!spend.allowed) {
      return { ok: false, error: spend.reason ?? "No CV credits left." };
    }

    try {
      if (profileInput) await upsertBuilderProfile(profileInput);

      const latex = generateLatexContent(profile);
      const pdf = await compileLatexToPdf(latex);

      // Store the PDF in the user's own Drive so it sits beside their other
      // application artifacts, rather than as bytes in Postgres.
      let driveFileId: string | null = null;
      let pdfUrl: string | null = null;
      try {
        const auth = await getGoogleAuthClient();
        const drive = new DriveClient(auth);
        const folderId = await drive.ensureBuiltCvFolder();
        driveFileId = await drive.uploadFile(
          pdf,
          builtCvFileName(profile),
          PDF_MIME,
          folderId,
        );
        pdfUrl = await drive.getWebViewLink(driveFileId);
      } catch (driveError) {
        // A Drive hiccup should not throw away a CV that compiled fine — the
        // version row still records the LaTeX so it can be re-rendered.
        console.warn("[builder] drive upload failed:", driveError);
      }

      const versionId = await insertBuilderCvVersion({
        cv_type: "original",
        professional_field: profile.professional_field,
        latex_content: latex,
        profile_snapshot: profile,
        drive_file_id: driveFileId,
        drive_pdf_url: pdfUrl,
      });

      await writeAuditLog("builder.cv_generated", "builder_cv_versions", versionId, {
        professional_field: profile.professional_field,
        pdf_bytes: pdf.length,
        drive_file_id: driveFileId,
      });

      revalidatePath("/builder");
      return {
        ok: true,
        version_id: versionId,
        pdf_url: pdfUrl,
        credits_left: Number.isFinite(spend.remaining) ? spend.remaining : -1,
      };
    } catch (error) {
      await refundCredit("cv");
      console.error("[builder] generation failed:", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "CV generation failed. Your credit was not used.",
      };
    }
  } catch (error) {
    console.error("[builder] generate unexpected:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "CV generation failed.",
    };
  }
}

/**
 * Load an old version's profile snapshot back into the editor.
 *
 * Generated CVs are immutable — each generation is its own version. "Editing"
 * one means restoring the inputs that produced it, changing them, and
 * generating again, which keeps the history intact.
 */
export async function loadCvVersionForEdit(
  versionId: string,
): Promise<{ ok: true; profile: BuilderProfile } | Failure> {
  try {
    await requireUser();
    const version = await getBuilderCvVersion(versionId);
    if (!version) return { ok: false, error: "That CV version was not found." };
    const snapshot = version.profile_snapshot;
    if (!snapshot?.name) {
      return { ok: false, error: "That version has no editable snapshot." };
    }
    return { ok: true, profile: snapshot };
  } catch (error) {
    console.error("[builder] load version failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load that CV.",
    };
  }
}

export type UseAsMasterResult =
  | { ok: true; slots: number; converted_doc_url: string; version_id: string }
  | Failure;

/**
 * Push a generated CV into the master resume.
 *
 * The Doc is written from the profile the CV was compiled from, not from the
 * PDF. Apply needs an editable Doc either way, and the PDF route to one went
 * through Drive's importer, which reads a page rather than a document: the
 * two-column role rows came out as a single run of words, the contact icons
 * as "Æ" and "½", the links as dead text, and the rebuilt body inherited the
 * name's 25pt size for the entire resume.
 *
 * A version saved before the builder stored profile snapshots has nothing to
 * write from, so those still take the old PDF path.
 */
export async function setCvAsMasterResume(
  versionId: string,
): Promise<UseAsMasterResult> {
  try {
    await requireUser();
    const version = await getBuilderCvVersion(versionId);
    if (!version) return { ok: false, error: "That CV version was not found." };

    const fieldLabel = isProfessionalField(version.professional_field ?? "")
      ? FIELD_LABELS[version.professional_field as ProfessionalField]
      : "General";
    // Recorded on master_resume so the profile can say which resume is live
    // — and so an older built CV stops claiming "In use" once it is replaced.
    const sourceInfo = {
      source: "builder" as const,
      label: `${fieldLabel} CV`,
      ref: versionId,
    };

    const profile = version.profile_snapshot;
    const result = profile?.name
      ? await masterFromProfile(profile, versionId, sourceInfo)
      : await masterFromCompiledPdf(version, versionId, sourceInfo);
    if (!result.ok) return result;

    await markVersionSyncedToMaster(versionId);
    revalidatePath("/builder");
    revalidatePath("/onboarding");
    return {
      ok: true,
      slots: result.slots,
      converted_doc_url: result.converted_doc_url,
      version_id: versionId,
    };
  } catch (error) {
    console.error("[builder] use-as-master failed:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not set that CV as your master resume.",
    };
  }
}

/**
 * Write the CV into a Google Doc of our own and sync that.
 *
 * The slot map comes from the same builder data as the text, so Apply knows
 * exactly which paragraph is which bullet without parsing anything back out.
 */
async function masterFromProfile(
  profile: BuilderProfile,
  versionId: string,
  sourceInfo: { source: "builder"; label: string; ref: string },
): Promise<MasterImportResult> {
  const built = buildMasterDoc(profile);
  // Same gate an imported resume passes: without role bullets there is nothing
  // for Apply to tailor, and finding that out after the Doc is written only
  // leaves the user a stray file in Drive.
  assertResumeSyncAtsReady(
    builtMasterToSynced(built, "pending"),
    built.lines.length,
  );

  const auth = await getGoogleAuthClient();
  const docs = new DocsClient(auth);
  const drive = new DriveClient(auth);

  const folderId = await drive.ensureBuiltCvFolder();
  const docId = await drive.createGoogleDoc(
    `${builtCvBaseName(profile)} (editable)`,
    folderId,
  );
  await docs.writeStructuredBody(docId, built.lines, { tightMargins: true });

  const synced = await syncFromReadableDoc(
    docs,
    drive,
    docId,
    { source: "builder_cv", builder_version_id: versionId, written_as_doc: true },
    sourceInfo,
    builtMasterToSynced(built, docId),
  );

  return {
    ...synced,
    converted_doc_id: docId,
    converted_doc_url: `https://docs.google.com/document/d/${docId}/edit`,
  };
}

/** Fallback for versions stored before profile snapshots were kept. */
async function masterFromCompiledPdf(
  version: NonNullable<Awaited<ReturnType<typeof getBuilderCvVersion>>>,
  versionId: string,
  sourceInfo: { source: "builder"; label: string; ref: string },
): Promise<MasterImportResult> {
  let pdf: Buffer;
  if (version.drive_file_id) {
    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    pdf = await drive.getFile(version.drive_file_id);
  } else if (version.latex_content) {
    // No Drive copy (upload failed at generation time) — rebuild from LaTeX.
    pdf = await compileLatexToPdf(version.latex_content);
  } else {
    return { ok: false, error: "That version has no PDF to sync." };
  }

  return importBytesAndSync(
    pdf,
    PDF_MIME,
    "builder-cv.pdf",
    { source: "builder_cv", builder_version_id: versionId },
    sourceInfo,
  );
}
