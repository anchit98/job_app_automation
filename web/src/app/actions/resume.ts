"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { maybeAdvanceApplicationStatus } from "@/app/actions/applications";
import { writeAuditLog } from "@/lib/audit";
import {
  completePromptRun,
  getActivePromptTemplate,
  getApplicationById,
  getMasterResumeRow,
  getNextResumeVersionNumber,
  getProfileRow,
  getPromptRunById,
  insertResumeVersion,
  listResumeVersions,
  markResumeVersionUploadFailed,
  createPromptRun,
  updatePromptRunText,
  updatePromptRunValidationErrors,
  updateResumeVersionDriveIds,
  updateResumeVersionContentForRetry,
  getResumeVersion,
  getResumeVersionById,
} from "@/lib/db/queries";
import { DriveClient } from "@/lib/google/drive";
import { DocsClient, type DocLayoutMap } from "@/lib/google/docs";
import { getGoogleAuthClient } from "@/lib/google/tokens";
import { isGoogleReconnectError } from "@/lib/google/reconnect";
import { buildJdContent, condenseMasterResume } from "@/lib/resume/context";
import { fitResumeToMasterLayout } from "@/lib/resume/auto-fit";
import { buildJdKeywordBrief } from "@/lib/resume/jd-keywords";
import {
  checkResumeFabrication,
  normalizeBulletsToMasterShape,
  resumeContentSchema,
  type ResumeContent,
} from "@/lib/resume/fabrication";
import { buildResumeStructuralGuide } from "@/lib/resume/prompt-anchors";
import { generateResumeFromDoc } from "@/lib/resume/gdoc-generate";
import {
  ANCHIT_BULLET_LAYOUT,
  BULLET_LAYOUT_VERSION,
  getDefaultMasterResumeRules,
  resolveBulletLayout,
} from "@/lib/resume/bullet-layout";
import {
  composePrompt,
  warnIfPromptTooLong,
} from "@/lib/prompt/composer";
import {
  extractJsonFromText,
  parsePromptRunMarker,
} from "@/lib/prompt/json-extract";
import {
  buildRepairPrompt,
  buildResumeRepairPrompt,
  zodErrorsToList,
} from "@/lib/prompt/repair";

function getLockedMasterResumeRules(
  stored?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...getDefaultMasterResumeRules(),
    ...stored,
    never_fabricate: true,
    bullet_layout_locked: true,
    bullet_layout_version: BULLET_LAYOUT_VERSION,
    bullet_layout: ANCHIT_BULLET_LAYOUT,
  };
}

export async function getResumeVersionsForApplication(applicationId: string) {
  return await listResumeVersions(applicationId);
}

function assertMasterDocReady(masterRow: Awaited<ReturnType<typeof getMasterResumeRow>>) {
  if (!masterRow?.content || Object.keys(masterRow.content).length === 0) {
    throw new Error(
      "Master resume not synced. Run 'Sync from Google Doc' on the onboarding page first.",
    );
  }
  if (!masterRow.doc_id) {
    throw new Error(
      "Master resume Google Doc ID is missing. Sync from Google Doc first.",
    );
  }
  if (!masterRow.doc_layout) {
    throw new Error(
      "Master resume layout map missing. Re-sync from Google Doc.",
    );
  }
}

function formatResumeExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Export failed";
  if (/not connected|token revoked|reconnect/i.test(message)) {
    return (
      "Resume JSON was accepted, but Google Drive export failed. " +
      "Reconnect Google on the dashboard, then the pipeline will retry the export automatically " +
      "(no need to re-run ChatGPT)."
    );
  }
  if (/file not found|404|not found/i.test(message)) {
    return (
      "Resume saved but file export failed: the master resume template is not accessible. " +
      "Reconnect Google on the dashboard (a new Drive read permission is required), " +
      'then go to Onboarding and click "Sync from Google Doc" again.'
    );
  }
  return `Resume saved but file export failed: ${message}`;
}

export async function exportResumePrompt(
  applicationId: string,
  options?: { condensed?: boolean },
) {
  const application = await getApplicationById(applicationId);
  if (!application) throw new Error("Application not found.");

  const masterRow = await getMasterResumeRow();
  assertMasterDocReady(masterRow);

  const masterParsed = resumeContentSchema.safeParse(masterRow!.content);
  if (!masterParsed.success) {
    throw new Error(
      "Master resume JSON is invalid. Re-sync from Google Doc to fix.",
    );
  }

  const template = await getActivePromptTemplate("resume");
  if (!template) throw new Error("No active resume prompt template.");

  const masterContent = options?.condensed
    ? condenseMasterResume(masterParsed.data)
    : masterParsed.data;

  const runId = await createPromptRun("resume", {
    entity: "applications",
    entityId: applicationId,
  });

  const masterRules = getLockedMasterResumeRules(masterRow!.rules);

  const promptText = composePrompt(
    template,
    {
      master_resume_json: JSON.stringify(masterContent, null, 2),
      jd_content: buildJdContent(application),
      jd_keyword_brief: buildJdKeywordBrief(application),
      rules_json: JSON.stringify(masterRules, null, 2),
      section_budgets: buildResumeStructuralGuide(
        masterContent,
        masterRules,
        masterRow!.doc_layout as Record<string, unknown> | null,
      ),
    },
    runId,
  );
  const lengthWarning = warnIfPromptTooLong(promptText);
  await updatePromptRunText(runId, promptText);

  await writeAuditLog("prompt.exported", "prompt_runs", runId, {
    kind: "resume",
    application_id: applicationId,
    condensed: Boolean(options?.condensed),
  });

  revalidatePath(`/applications/${applicationId}`);
  return {
    prompt_run_id: runId,
    prompt_text: promptText,
    length_warning: lengthWarning,
    chatgpt_url: "https://chat.openai.com/",
  };
}

async function persistResumeArtifacts(
  applicationId: string,
  promptRunId: string,
  content: ResumeContent,
  options?: { deferDrive?: boolean },
) {
  const application = await getApplicationById(applicationId);
  if (!application) throw new Error("Application not found.");

  const masterRow = await getMasterResumeRow();
  assertMasterDocReady(masterRow);

  const profile = await getProfileRow();
  const fullName = profile?.full_name ?? "Anchit Boruah";

  // Reuse an existing upload_failed / uploading row for this prompt so retries
  // don't create v2…v7 clones while Google is disconnected.
  const existing = (await listResumeVersions(applicationId)).find(
    (v) =>
      v.prompt_run_id === promptRunId &&
      (v.status === "upload_failed" || v.status === "uploading"),
  );
  const resumeVersionId = existing?.id ?? randomUUID();
  const version = existing?.version ?? await getNextResumeVersionNumber(applicationId);

  if (!existing) {
    await insertResumeVersion({
      id: resumeVersionId,
      application_id: applicationId,
      version,
      content,
      prompt_run_id: promptRunId,
      status: "uploading",
    });
  } else {
    await updateResumeVersionContentForRetry(resumeVersionId, content);
  }

  const finishDrive = async () => {
    try {
      const auth = await getGoogleAuthClient();
      const drive = new DriveClient(auth);
      const docs = new DocsClient(auth);

      const result = await generateResumeFromDoc(drive, docs, {
        masterDocId: masterRow!.doc_id!,
        layout: masterRow!.doc_layout as unknown as DocLayoutMap,
        tailored: content,
        application,
        version,
        fullName,
      });

      await updateResumeVersionDriveIds(
        resumeVersionId,
        result.drive_pdf_id,
        null,
        result.drive_doc_id,
      );

      await writeAuditLog("resume.generated", "resume_versions", resumeVersionId, {
        application_id: applicationId,
        version,
        drive_doc_id: result.drive_doc_id,
        drive_pdf_id: result.drive_pdf_id,
        pdf_name: result.pdf_name,
      });

      return {
        resume_version_id: resumeVersionId,
        version,
        pdf_name: result.pdf_name,
      };
    } catch (e) {
      await markResumeVersionUploadFailed(resumeVersionId);
      throw e;
    }
  };

  if (options?.deferDrive) {
    // ChatGPT chain continues; Drive runs after the HTTP response.
    after(() => {
      void finishDrive().catch((err) => {
        console.error("[resume] deferred Drive export failed", err);
      });
    });
    return {
      resume_version_id: resumeVersionId,
      version,
      pdf_name: null as string | null,
      deferred: true as const,
    };
  }

  return finishDrive();
}

export async function submitResumeResponse(
  promptRunId: string,
  rawResponse: string,
  options?: { acceptedFlagIds?: string[] },
) {
  if (!rawResponse.trim()) {
    return {
      ok: false as const,
      error: "Response is empty. Paste the ChatGPT output and try again.",
    };
  }

  const markerId = parsePromptRunMarker(rawResponse);
  if (markerId && markerId !== promptRunId) {
    return {
      ok: false as const,
      error: `This response belongs to a different prompt run (${markerId}).`,
    };
  }

  const existing = await getPromptRunById(promptRunId);
  if (!existing) {
    return { ok: false as const, error: "Prompt run not found." };
  }
  if (existing.kind !== "resume") {
    return { ok: false as const, error: "Not a resume prompt run." };
  }
  if (!existing.target_entity_id) {
    return { ok: false as const, error: "Resume prompt run is missing application link." };
  }

  if (existing.status === "completed") {
    const versions = await listResumeVersions(existing.target_entity_id);
    const linked = versions.find((v) => v.prompt_run_id === promptRunId);
    return {
      ok: true as const,
      already_completed: true,
      version: linked?.version,
      resume_version_id: linked?.id,
    };
  }

  const masterRow = await getMasterResumeRow();
  if (!masterRow) {
    return { ok: false as const, error: "Master resume not found." };
  }
  const masterParsed = resumeContentSchema.safeParse(masterRow.content);
  if (!masterParsed.success) {
    return { ok: false as const, error: "Master resume schema is invalid." };
  }

  let jsonText: string;
  try {
    jsonText = extractJsonFromText(rawResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    await updatePromptRunValidationErrors(promptRunId, [{ path: "root", message }], rawResponse);
    const template = await getActivePromptTemplate("resume");
    return {
      ok: false as const,
      error: message,
      repair_prompt: buildRepairPrompt(
        [{ path: "root", message }],
        template?.output_schema
          ? JSON.stringify(template.output_schema, null, 2)
          : "{}",
        rawResponse,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false as const, error: "Parsed text is not valid JSON." };
  }

  const masterRules = getLockedMasterResumeRules(masterRow.rules);
  const bulletLayout = resolveBulletLayout(masterParsed.data, masterRules);
  const application = await getApplicationById(existing.target_entity_id);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  // Merge tailored response with master structural fields so schema/fabrication
  // checks work against a full ResumeContent object.
  const merged = mergeTailoredWithMaster(
    masterParsed.data,
    parsed,
    bulletLayout,
  );
  const fitted = fitResumeToMasterLayout(
    merged,
    masterParsed.data,
    masterRow.doc_layout as Record<string, unknown> | null,
  );

  const schemaResult = resumeContentSchema.safeParse(fitted);
  if (!schemaResult.success) {
    const errors = zodErrorsToList(schemaResult.error);
    await updatePromptRunValidationErrors(promptRunId, errors, rawResponse);
    const template = await getActivePromptTemplate("resume");
    return {
      ok: false as const,
      error: "Response failed resume schema validation.",
      validation_errors: errors,
      repair_prompt: buildRepairPrompt(
        errors,
        template?.output_schema
          ? JSON.stringify(template.output_schema, null, 2)
          : "{}",
        rawResponse,
      ),
    };
  }

  // Fabrication / JD-keyword flags are advisory only — auto-approved (no checkbox gate).
  const fabrication = checkResumeFabrication(
    masterParsed.data,
    schemaResult.data,
    masterRules,
    masterRow.doc_layout as Record<string, unknown> | null,
  );

  if (fabrication.structural_errors.length > 0) {
    await updatePromptRunValidationErrors(
      promptRunId,
      fabrication.structural_errors.map((f) => ({
        path: f.path,
        message: f.message,
      })),
      rawResponse,
    );
    return {
      ok: false as const,
      error: fabrication.structural_errors.some((f) => f.path === "tailorable")
        ? "Word count exceeds the 400-word ceiling for bullets + skills. See the repair prompt."
        : "Structural validation failed. See the repair prompt.",
      structural_errors: fabrication.structural_errors,
      repair_prompt: buildResumeRepairPrompt(
        fabrication.structural_errors.map((f) => ({
          path: f.path,
          message: f.message,
          bullet: f.bullet,
        })),
        rawResponse,
      ),
    };
  }

  // Content already accepted — do not block ChatGPT chain on Drive.
  {
    const versions = await listResumeVersions(existing.target_entity_id);
    const linked = versions.find((v) => v.prompt_run_id === promptRunId);
    if (linked?.status === "ready" || linked?.status === "uploading") {
      if (existing.status !== "completed") {
        await completePromptRun(
          promptRunId,
          rawResponse,
          schemaResult.data as Record<string, unknown>,
        );
      }
      return {
        ok: true as const,
        already_completed: true,
        version: linked.version,
        resume_version_id: linked.id,
      };
    }
  }

  // Save content + complete prompt immediately; Drive export runs in background.
  try {
    const result = await persistResumeArtifacts(
      existing.target_entity_id,
      promptRunId,
      schemaResult.data,
      { deferDrive: true },
    );

    await completePromptRun(
      promptRunId,
      rawResponse,
      schemaResult.data as Record<string, unknown>,
    );
    await writeAuditLog("prompt.completed", "prompt_runs", promptRunId);

    revalidatePath(`/applications/${existing.target_entity_id}`);
    const status_advance = await maybeAdvanceApplicationStatus(
      existing.target_entity_id,
      "resume_ready",
    );
    return {
      ok: true as const,
      parsed: schemaResult.data,
      version: result.version,
      resume_version_id: result.resume_version_id,
      status_advance,
      drive_deferred: true as const,
    };
  } catch (e) {
    const error = formatResumeExportError(e);
    return {
      ok: false as const,
      error,
      parsed: schemaResult.data,
      upload_failed: true,
      reconnect_required: isGoogleReconnectError(error),
    };
  }
}

/**
 * ChatGPT only returns tailored bullets/skills/headline. Merge with master
 * structural fields (company, title, dates, project names, education, etc.)
 * so the ResumeContent object we validate + fabrication-check is complete.
 */
function mergeTailoredWithMaster(
  master: ResumeContent,
  raw: unknown,
  bulletLayout: ReturnType<typeof resolveBulletLayout>,
): ResumeContent {
  const tailored = (raw ?? {}) as {
    headline?: string;
    experience?: Array<{ bullets?: string[] }>;
    projects?: Array<{ bullets?: string[] }>;
    skills?: string[];
  };

  return {
    headline: tailored.headline ?? master.headline,
    contact_line: master.contact_line,
    links_line: master.links_line,
    experience: master.experience.map((role, i) => ({
      ...role,
      bullets: normalizeBulletsToMasterShape(
        role.bullets,
        tailored.experience?.[i]?.bullets,
      ),
    })),
    projects: master.projects.map((project, i) => ({
      ...project,
      bullets: normalizeBulletsToMasterShape(
        project.bullets,
        tailored.projects?.[i]?.bullets,
      ),
    })),
    skills:
      tailored.skills && tailored.skills.length === master.skills.length
        ? tailored.skills
        : master.skills.map((line) => line),
    education: master.education,
  };
}

export async function retryResumeUpload(resumeVersionId: string) {
  const versionRow = await getResumeVersionById(resumeVersionId);
  if (!versionRow || versionRow.status !== "upload_failed") {
    return { ok: false as const, error: "Nothing to retry." };
  }

  const application = await getApplicationById(versionRow.application_id);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  const masterRow = await getMasterResumeRow();
  try {
    assertMasterDocReady(masterRow);
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Master doc not ready",
    };
  }

  const profile = await getProfileRow();
  const fullName = profile?.full_name ?? "Anchit Boruah";

  try {
    const auth = await getGoogleAuthClient();
    const drive = new DriveClient(auth);
    const docs = new DocsClient(auth);

    const result = await generateResumeFromDoc(drive, docs, {
      masterDocId: masterRow!.doc_id!,
      layout: masterRow!.doc_layout as unknown as DocLayoutMap,
      tailored: versionRow.content,
      application,
      version: versionRow.version,
      fullName,
    });

    await updateResumeVersionDriveIds(
      versionRow.id,
      result.drive_pdf_id,
      null,
      result.drive_doc_id,
    );

    // Finish the ChatGPT prompt once Drive export succeeds so the pipeline can leave resume.
    if (versionRow.prompt_run_id) {
      const prompt = await getPromptRunById(versionRow.prompt_run_id);
      if (prompt?.status === "pending") {
        await completePromptRun(
          versionRow.prompt_run_id,
          JSON.stringify(versionRow.content),
          versionRow.content as unknown as Record<string, unknown>,
        );
        await writeAuditLog(
          "prompt.completed",
          "prompt_runs",
          versionRow.prompt_run_id,
          { recovered_from: "resume_upload_retry" },
        );
      }
    }

    revalidatePath(`/applications/${versionRow.application_id}`);
    await maybeAdvanceApplicationStatus(
      versionRow.application_id,
      "resume_ready",
    );
    return { ok: true as const };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Retry failed";
    return {
      ok: false as const,
      error: formatResumeExportError(e),
      reconnect_required: isGoogleReconnectError(error),
    };
  }
}

/**
 * If ChatGPT already produced resume JSON but Drive export failed, retry export
 * and complete the prompt — used by advancePipeline so reconnecting Google unblocks.
 */
export async function recoverResumeExportForPromptRun(
  applicationId: string,
  promptRunId: string,
): Promise<{
  ok: boolean;
  error?: string;
  reconnect_required?: boolean;
}> {
  const versions = (await listResumeVersions(applicationId))
    .filter((v) => v.prompt_run_id === promptRunId)
    .sort((a, b) => b.version - a.version);

  const ready = versions.find((v) => v.status === "ready");
  if (ready) {
    const prompt = await getPromptRunById(promptRunId);
    if (prompt?.status === "pending") {
      await completePromptRun(
        promptRunId,
        JSON.stringify(ready.content),
        ready.content as unknown as Record<string, unknown>,
      );
    }
    return { ok: true };
  }

  const failed = versions.find((v) => v.status === "upload_failed");
  if (!failed) {
    return { ok: false, error: "No saved resume content to export yet." };
  }

  return retryResumeUpload(failed.id);
}

export async function getResumeVersionForDownload(
  applicationId: string,
  version: number,
) {
  return await getResumeVersion(applicationId, version);
}
