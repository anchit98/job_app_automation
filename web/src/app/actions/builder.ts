"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { writeAuditLog } from "@/lib/audit";
import { refundCredit, spendCredit } from "@/lib/billing/entitlements";
import { compileLatexToPdf } from "@/lib/builder/compile-pdf";
import { generateLatexContent } from "@/lib/builder/latex-engine";
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
import { DriveClient } from "@/lib/google/drive";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { PDF_MIME, importBytesAndSync } from "@/lib/resume/master-import";

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
  const who = safeFileName(profile.name?.trim() || "CV");
  const date = new Date().toISOString().slice(0, 10);
  return `${who}_CV_${profile.professional_field}_${date}.pdf`;
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
 * Reuses the PDF import path, so a builder CV becomes an editable Google Doc
 * and Apply keeps working exactly as it does for an uploaded resume.
 */
export async function setCvAsMasterResume(
  versionId: string,
): Promise<UseAsMasterResult> {
  try {
    await requireUser();
    const version = await getBuilderCvVersion(versionId);
    if (!version) return { ok: false, error: "That CV version was not found." };

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

    const fieldLabel = isProfessionalField(version.professional_field ?? "")
      ? FIELD_LABELS[version.professional_field as ProfessionalField]
      : "General";
    const result = await importBytesAndSync(
      pdf,
      PDF_MIME,
      "builder-cv.pdf",
      { source: "builder_cv", builder_version_id: versionId },
      // Recorded on master_resume so the profile can say which resume is live
      // — and so an older built CV stops claiming "In use" once it is replaced.
      {
        source: "builder",
        label: `${fieldLabel} CV`,
        ref: versionId,
      },
    );
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
