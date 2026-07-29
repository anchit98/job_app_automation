"use server";

import { z } from "zod";
import { createApplication, exportJdParsePrompt } from "@/app/actions/applications";
import { saveManualContact } from "@/app/actions/contacts";
import {
  exportCoverLetterPrompt,
  recoverCoverLetterExportForPromptRun,
  submitCoverLetterResponse,
} from "@/app/actions/cover-letter";
import {
  createGmailDrafts,
  exportColdEmailsPrompt,
  submitColdEmailsResponse,
} from "@/app/actions/emails";
import { submitFollowUpResponse } from "@/app/actions/follow-ups";
import { submitPasteBack } from "@/app/actions/prompts";
import {
  exportResumePrompt,
  recoverResumeExportForPromptRun,
  submitResumeResponse,
} from "@/app/actions/resume";
import {
  claimNextQueuedPipeline,
  claimPipelineStageStart,
  completePendingExtensionRun,
  getLatestPipelineForApplication,
  getPipelineRunById,
  insertPipelineRun,
  listBusyPipelineRuns,
  listQueuedPipelineRuns,
  listLatestPipelinesForApplications,
  updatePipelineRun,
  upsertPendingExtensionRun,
  armExtensionWake,
} from "@/lib/db/pipeline";
import {
  getApplicationById,
  getLatestReadyCoverLetterVersion,
  getLatestReadyResumeVersion,
  getLatestUsableCoverLetterVersion,
  getLatestUsableResumeVersion,
  getPromptRunById,
  listContacts,
  listCoverLetterVersions,
  listEmails,
  listResumeVersions,
  updateApplicationEmailInstructions,
} from "@/lib/db/queries";
import type {
  PipelineContactInput,
  PipelineRunRecord,
  PipelineStage,
  PipelineStageId,
} from "@/lib/pipeline/types";

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
  linkedin_url: z.string().optional(),
});

const startSchema = z.object({
  jd: z.string().min(50),
  company: z.string().trim().min(1, "Company is required."),
  role: z.string().trim().min(1, "Role is required."),
  job_url: z.string().optional(),
  notes: z.string().optional(),
  email_instructions: z.string().optional(),
  contacts: z.array(contactSchema).default([]),
  skip_jd_parse: z.boolean().optional(),
});

function patchStage(
  stages: PipelineStage[],
  id: PipelineStageId,
  patch: Partial<PipelineStage>,
): PipelineStage[] {
  return stages.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Skip contact save + cold email + Gmail when Quick Apply has no contacts. */
function skipContactEmailStages(stages: PipelineStage[]): PipelineStage[] {
  let next = stages;
  for (const id of ["save_contacts", "cold_email", "gmail_drafts"] as const) {
    next = patchStage(next, id, {
      status: "skipped",
      detail: "Skipped - no contacts",
    });
  }
  return next;
}

function findStage(
  run: PipelineRunRecord,
  id: PipelineStageId,
): PipelineStage | undefined {
  return run.stages.find((s) => s.id === id);
}

async function registerChatGptPending(
  pipelineId: string,
  promptRunId: string,
  kind: string,
  promptText: string,
  chatgptUrl: string,
) {
  await upsertPendingExtensionRun({
    prompt_run_id: promptRunId,
    pipeline_run_id: pipelineId,
    kind,
    prompt_text: promptText,
    chatgpt_url: chatgptUrl,
  });
  // Arm immediately so JobApp Bridge can open ChatGPT for this stage
  // (including JD parse) without waiting on a separate client-only step.
  await armExtensionWake(promptRunId, 300);
}

async function savePipelineContactsNow(
  applicationId: string,
  contacts: PipelineContactInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const c of contacts) {
    const result = await saveManualContact(applicationId, {
      name: c.name,
      email: c.email,
      role: c.role ?? null,
      linkedin_url: c.linkedin_url || null,
    });
    if (!result.ok) {
      return { ok: false, error: result.error ?? "Failed to save contact." };
    }
  }
  return { ok: true };
}

async function bootstrapAndAdvancePipeline(input: {
  application_id: string;
  contacts: PipelineContactInput[];
  skip_jd_parse?: boolean;
  contacts_already_saved?: boolean;
}) {
  let contactsAlreadySaved = Boolean(input.contacts_already_saved);

  // Persist contacts immediately at start so they appear on the application
  // before JD parse / resume - not only after cover letter.
  if (!contactsAlreadySaved && input.contacts.length > 0) {
    const saved = await savePipelineContactsNow(
      input.application_id,
      input.contacts,
    );
    if (!saved.ok) {
      return { ok: false as const, error: saved.error };
    }
    contactsAlreadySaved = true;
  }

  let pipeline = await insertPipelineRun({
    application_id: input.application_id,
    contacts: input.contacts,
  });

  let stages = pipeline.stages;

  if (input.skip_jd_parse) {
    stages = patchStage(stages, "jd_parse", {
      status: "skipped",
      detail: "Skipped - company/role already set",
    });
  }

  if (input.contacts.length === 0) {
    stages = skipContactEmailStages(stages);
  } else if (contactsAlreadySaved) {
    stages = patchStage(stages, "save_contacts", {
      status: "skipped",
      detail: "Contacts saved at start",
    });
  }

  const nextStage: PipelineStageId = input.skip_jd_parse ? "resume" : "jd_parse";

  const busy = await listBusyPipelineRuns();
  if (busy.length > 0) {
    pipeline =
      await updatePipelineRun(pipeline.id, {
        stages,
        current_stage: nextStage,
        status: "queued",
      }) ?? pipeline;
    return {
      ok: true as const,
      pipeline_id: pipeline.id,
      application_id: input.application_id,
      queued: true as const,
      queued_behind: busy.length,
      advance: { ok: true as const, pipeline },
      warning: `Queued behind ${busy.length} active application(s). It will start automatically when the current one finishes.`,
    };
  }

  pipeline =
    await updatePipelineRun(pipeline.id, {
      stages,
      current_stage: nextStage,
      status: "running",
    }) ?? pipeline;

  const advanced = await advancePipeline(pipeline.id);
  return {
    ok: true as const,
    pipeline_id: pipeline.id,
    application_id: input.application_id,
    queued: false as const,
    advance: advanced,
    warning: advanced.ok ? undefined : advanced.error,
  };
}

export async function startQuickApplyPipeline(input: z.infer<typeof startSchema>) {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const created = await createApplication({
      jd: parsed.data.jd,
      company: parsed.data.company,
      role: parsed.data.role,
      job_url: parsed.data.job_url,
      notes: parsed.data.notes,
      email_instructions: parsed.data.email_instructions,
    });
    if (!created.ok) {
      return { ok: false as const, error: created.error };
    }

    const result = await bootstrapAndAdvancePipeline({
      application_id: created.id,
      contacts: parsed.data.contacts,
      // Always run JD parse automatically (company/role hints are optional).
      skip_jd_parse: parsed.data.skip_jd_parse === true,
      contacts_already_saved: false,
    });

    return {
      ...result,
      similar_applications: created.similar_applications,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to start auto-apply pipeline.";
    console.error("startQuickApplyPipeline failed:", e);
    return { ok: false as const, error: message };
  }
}

const forExistingSchema = z.object({
  applicationId: z.string().min(1),
  contacts: z.array(contactSchema).optional(),
  skip_jd_parse: z.boolean().optional(),
  email_instructions: z.string().optional(),
});

/**
 * Re-run the auto-apply pipeline for an existing application (old or new).
 * Uses provided contacts, or saved contacts with emails.
 */
export async function startQuickApplyForApplication(
  input: z.infer<typeof forExistingSchema>,
) {
  const parsed = forExistingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const application = await getApplicationById(parsed.data.applicationId);
    if (!application) {
      return { ok: false as const, error: "Application not found." };
    }
    if (!application.jd_raw || application.jd_raw.trim().length < 50) {
      return {
        ok: false as const,
        error: "This application has no usable job description.",
      };
    }

    if (parsed.data.email_instructions !== undefined) {
      await updateApplicationEmailInstructions(
        application.id,
        parsed.data.email_instructions.trim() || null,
      );
    }

    let contacts = parsed.data.contacts ?? [];
    let contactsAlreadySaved = false;

    // Only fall back to saved contacts when the client omitted the field.
    // An explicit empty array means "skip cold email / Gmail drafts".
    if (parsed.data.contacts === undefined) {
      contacts = (await listContacts(application.id))
        .filter((c) => Boolean(c.email?.trim()))
        .map((c) => ({
          name: c.name,
          email: c.email!,
          role: c.role ?? undefined,
          linkedin_url: c.linkedin_url ?? undefined,
        }));
      contactsAlreadySaved = contacts.length > 0;
    }

    return await bootstrapAndAdvancePipeline({
      application_id: application.id,
      contacts,
      // Always re-parse JD automatically unless explicitly skipped.
      skip_jd_parse: parsed.data.skip_jd_parse === true,
      contacts_already_saved: contactsAlreadySaved,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to start Quick Apply.";
    console.error("startQuickApplyForApplication failed:", e);
    return { ok: false as const, error: message };
  }
}

export async function getPipelineStatus(pipelineId: string) {
  const run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };
  const application = await getApplicationById(run.application_id);
  const resume = await getLatestReadyResumeVersion(run.application_id);
  const coverLetter = await getLatestReadyCoverLetterVersion(run.application_id);
  return {
    ok: true as const,
    pipeline: run,
    application_status: application?.status ?? null,
    company: application?.company ?? null,
    role: application?.role ?? null,
    downloads: {
      resume_version: resume?.version ?? null,
      cover_letter_version: coverLetter?.version ?? null,
    },
  };
}

type AdvanceOptions = {
  /** When true, stop after cold_email and let Gmail drafts run in a separate call. */
  deferGmailDrafts?: boolean;
};

type AdvanceResult =
  | {
      ok: true;
      pipeline: PipelineRunRecord;
      done?: boolean;
      awaiting_chatgpt?: boolean;
      prompt_run_id?: string | null;
      prompt_text?: string | null;
      chatgpt_url?: string;
      repair_prompt?: string | null;
      deferred_gmail?: boolean;
    }
  | {
      ok: false;
      error: string;
      pipeline?: PipelineRunRecord;
    };

/**
 * Drive the pipeline forward. For ChatGPT stages, exports a prompt and pauses
 * in awaiting_chatgpt until submitPipelineResponse / extension paste-back.
 *
 * Concurrent callers (UI poll + paste-back) share one in-flight promise so
 * gmail_drafts cannot be marked completed while still running.
 */
const advancingPipelines = new Map<string, Promise<AdvanceResult>>();

async function promoteNextQueuedPipeline(): Promise<AdvanceResult | null> {
  const claimed = await claimNextQueuedPipeline();
  if (!claimed) return null;
  return advancePipeline(claimed.id);
}

async function finishPipelineAndPromote(
  pipelineId: string,
  patch: {
    status: "completed" | "failed" | "needs_manual";
    current_stage?: PipelineStageId | null;
    stages?: PipelineStage[];
    error?: string | null;
  },
  fallback: PipelineRunRecord,
): Promise<PipelineRunRecord> {
  const updated =
    (await updatePipelineRun(pipelineId, {
      status: patch.status,
      current_stage:
        patch.current_stage !== undefined ? patch.current_stage : null,
      stages: patch.stages,
      error: patch.error !== undefined ? patch.error : null,
    })) ?? fallback;
  void promoteNextQueuedPipeline().catch((err) => {
    console.error("[pipeline] promoteNextQueuedPipeline failed", err);
  });
  return updated;
}

export async function advancePipeline(
  pipelineId: string,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const existing = advancingPipelines.get(pipelineId);
  if (existing) return existing;

  const promise = advancePipelineInner(pipelineId, options).finally(() => {
    if (advancingPipelines.get(pipelineId) === promise) {
      advancingPipelines.delete(pipelineId);
    }
  });
  advancingPipelines.set(pipelineId, promise);
  return promise;
}

async function advancePipelineInner(
  pipelineId: string,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  let run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };
  if (run.status === "completed") {
    return { ok: true as const, pipeline: run, done: true };
  }
  if (run.status === "queued") {
    return { ok: true as const, pipeline: run };
  }
  if (run.status === "failed") {
    return { ok: false as const, error: run.error ?? "Pipeline failed.", pipeline: run };
  }

  // If waiting on ChatGPT, check whether the prompt run completed (extension path).
  if (run.status === "awaiting_chatgpt" && run.current_stage) {
    const currentStage = run.current_stage;
    const stage = findStage(run, currentStage);
    if (stage?.prompt_run_id) {
      // Resume/cover letter may have valid ChatGPT JSON already saved as
      // upload_failed while Google was disconnected - retry Drive export first.
      if (currentStage === "resume" || currentStage === "cover_letter") {
        const hasFailedArtifact =
          currentStage === "resume"
            ? (await listResumeVersions(run.application_id)).some(
                (v) =>
                  v.prompt_run_id === stage.prompt_run_id &&
                  v.status === "upload_failed",
              )
            : (await listCoverLetterVersions(run.application_id)).some(
                (v) =>
                  v.prompt_run_id === stage.prompt_run_id &&
                  v.status === "upload_failed",
              );

        if (hasFailedArtifact) {
          const recovered =
            currentStage === "resume"
              ? await recoverResumeExportForPromptRun(
                  run.application_id,
                  stage.prompt_run_id,
                )
              : await recoverCoverLetterExportForPromptRun(
                  run.application_id,
                  stage.prompt_run_id,
                );

          if (!recovered.ok && recovered.error) {
            const stages = patchStage(run.stages, currentStage, {
              status: "awaiting_chatgpt",
              error: recovered.error,
              detail: recovered.reconnect_required
                ? "Reconnect Google to finish Drive export"
                : "Drive export pending",
            });
            run =
              await updatePipelineRun(pipelineId, {
                status: "awaiting_chatgpt",
                stages,
                error: recovered.error,
              }) ?? run;
          } else if (recovered.ok) {
            const stages = patchStage(run.stages, currentStage, {
              error: null,
              detail: "Drive export ready",
            });
            run =
              await updatePipelineRun(pipelineId, {
                stages,
                error: null,
              }) ?? run;
          }
        }
      }

      const promptRun = await getPromptRunById(stage.prompt_run_id);
      if (promptRun?.status === "completed") {
        // Advance once ChatGPT content is accepted. Drive PDFs finish in the background.
        if (
          !(await chatgptStageArtifactsReady(
            currentStage,
            run.application_id,
            stage.prompt_run_id,
          ))
        ) {
          return {
            ok: true as const,
            pipeline: run,
            awaiting_chatgpt: true,
            prompt_run_id: stage.prompt_run_id,
            prompt_text: stage.prompt_text ?? null,
            chatgpt_url: stage.chatgpt_url ?? "https://chatgpt.com/",
            repair_prompt: stage.repair_prompt ?? null,
          };
        }
        const after = await onChatGptStageCompleted(
          pipelineId,
          currentStage,
          options,
        );
        return after;
      }
    }
    return {
      ok: true as const,
      pipeline: run,
      awaiting_chatgpt: true,
      prompt_run_id: stage?.prompt_run_id ?? null,
      prompt_text: stage?.prompt_text ?? null,
      chatgpt_url: stage?.chatgpt_url ?? "https://chatgpt.com/",
      repair_prompt: stage?.repair_prompt ?? null,
    };
  }

  // Never treat an in-flight stage as "nothing left to do".
  const runningStage = run.stages.find((s) => s.status === "running");
  if (runningStage) {
    // Another isolate may have claimed a ChatGPT stage and still be exporting -
    // wait for awaiting_chatgpt so paste-back can chain the next tab.
    if (
      runningStage.id === "jd_parse" ||
      runningStage.id === "resume" ||
      runningStage.id === "cover_letter" ||
      runningStage.id === "cold_email"
    ) {
      return awaitExistingChatGptStage(pipelineId, runningStage.id, run);
    }
    // Non-ChatGPT stage left mid-flight (serverless timeout / tab closed) - retry.
    const stages = patchStage(run.stages, runningStage.id, {
      status: "pending",
      error: null,
      detail: "Retrying after interrupted run",
    });
    run =
      await updatePipelineRun(pipelineId, {
        status: "running",
        current_stage: runningStage.id,
        stages,
        error: null,
      }) ?? run;
  }

  const next = nextPendingStage(run);
  if (!next) {
    run = await finishPipelineAndPromote(
      pipelineId,
      { status: "completed", current_stage: null, error: null },
      run,
    );
    return { ok: true as const, pipeline: run, done: true };
  }

  try {
    switch (next.id) {
      case "jd_parse":
        return await startJdParseStage(pipelineId, run);
      case "resume":
        return await startResumeStage(pipelineId, run);
      case "cover_letter":
        return await startCoverLetterStage(pipelineId, run);
      case "save_contacts":
        return await runSaveContactsStage(pipelineId, run, options);
      case "cold_email":
        return await startColdEmailStage(pipelineId, run);
      case "gmail_drafts":
        return await runGmailDraftsStage(pipelineId, run);
      default:
        return {
          ok: false as const,
          error: `Unknown stage: ${next.id}`,
          pipeline: run,
        };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage failed.";
    const stages = patchStage(run.stages, next.id, {
      status: "failed",
      error: message,
    });
    run = await finishPipelineAndPromote(
      pipelineId,
      {
        status: "failed",
        current_stage: next.id,
        stages,
        error: message,
      },
      run,
    );
    return { ok: false as const, error: message, pipeline: run };
  }
}

function nextPendingStage(run: PipelineRunRecord): PipelineStage | null {
  return (
    run.stages.find(
      (s) =>
        s.status === "pending" ||
        (s.status === "failed" && s.id === run.current_stage),
    ) ?? null
  );
}

/** True when ChatGPT stage content is accepted (Drive may still be uploading). */
async function chatgptStageArtifactsReady(
  stageId: PipelineStageId,
  applicationId: string,
  promptRunId: string,
): Promise<boolean> {
  switch (stageId) {
    case "resume":
      return (await listResumeVersions(applicationId)).some(
        (v) =>
          v.prompt_run_id === promptRunId &&
          (v.status === "ready" || v.status === "uploading"),
      );
    case "cover_letter":
      return (await listCoverLetterVersions(applicationId)).some(
        (v) =>
          v.prompt_run_id === promptRunId &&
          (v.status === "ready" || v.status === "uploading"),
      );
    case "cold_email":
      return (await listEmails(applicationId)).some((e) => e.prompt_run_id === promptRunId);
    default:
      return true;
  }
}

async function markAwaitingChatGpt(
  pipelineId: string,
  run: PipelineRunRecord,
  stageId: PipelineStageId,
  exported: {
    prompt_run_id: string;
    prompt_text: string;
    chatgpt_url: string;
  },
  extra?: Partial<PipelineStage>,
) {
  await registerChatGptPending(
    pipelineId,
    exported.prompt_run_id,
    stageId,
    exported.prompt_text,
    exported.chatgpt_url,
  );

  const stages = patchStage(run.stages, stageId, {
    status: "awaiting_chatgpt",
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url,
    error: null,
    repair_prompt: null,
    ...extra,
  });

  const updated =
    await updatePipelineRun(pipelineId, {
      status: "awaiting_chatgpt",
      current_stage: stageId,
      stages,
      error: null,
    }) ?? run;

  return {
    ok: true as const,
    pipeline: updated,
    awaiting_chatgpt: true as const,
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url,
  };
}

/**
 * When another isolate already claimed this stage, wait briefly for it to
 * finish exporting and reach awaiting_chatgpt - do not export a second prompt.
 */
async function awaitExistingChatGptStage(
  pipelineId: string,
  stageId: PipelineStageId,
  fallback: PipelineRunRecord,
): Promise<AdvanceResult> {
  for (let i = 0; i < 8; i++) {
    const fresh = await getPipelineRunById(pipelineId);
    if (!fresh) break;
    if (fresh.status === "awaiting_chatgpt" && fresh.current_stage === stageId) {
      const stage = findStage(fresh, stageId);
      if (stage?.prompt_run_id && stage.prompt_text) {
        return {
          ok: true as const,
          pipeline: fresh,
          awaiting_chatgpt: true as const,
          prompt_run_id: stage.prompt_run_id,
          prompt_text: stage.prompt_text,
          chatgpt_url: stage.chatgpt_url ?? "https://chatgpt.com/",
          repair_prompt: stage.repair_prompt ?? null,
        };
      }
    }
    // Stage already finished (winner raced ahead) - let caller re-advance.
    if (findStage(fresh, stageId)?.status === "completed") {
      return advancePipelineInner(pipelineId);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const latest = (await getPipelineRunById(pipelineId)) ?? fallback;
  return { ok: true as const, pipeline: latest };
}

async function startJdParseStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "jd_parse");
  if (!claimed) return awaitExistingChatGptStage(pipelineId, "jd_parse", run);
  const exported = await exportJdParsePrompt(claimed.application_id);
  return markAwaitingChatGpt(pipelineId, claimed, "jd_parse", exported);
}

async function startResumeStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "resume");
  if (!claimed) return awaitExistingChatGptStage(pipelineId, "resume", run);
  const exported = await exportResumePrompt(claimed.application_id);
  return markAwaitingChatGpt(pipelineId, claimed, "resume", {
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url,
  });
}

async function startCoverLetterStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "cover_letter");
  if (!claimed) {
    return awaitExistingChatGptStage(pipelineId, "cover_letter", run);
  }
  const exported = await exportCoverLetterPrompt(claimed.application_id);
  return markAwaitingChatGpt(pipelineId, claimed, "cover_letter", {
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url,
  });
}

async function runSaveContactsStage(
  pipelineId: string,
  run: PipelineRunRecord,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const contacts = run.contacts as PipelineContactInput[];
  if (contacts.length === 0) {
    const stages = skipContactEmailStages(run.stages);
    await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: null,
      stages,
    });
    return advancePipelineInner(pipelineId, options);
  }

  const stagesRunning = patchStage(run.stages, "save_contacts", {
    status: "running",
  });
  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: "save_contacts",
    stages: stagesRunning,
  });

  for (const c of contacts) {
    const result = await saveManualContact(run.application_id, {
      name: c.name,
      email: c.email,
      role: c.role ?? null,
      linkedin_url: c.linkedin_url || null,
    });
    if (!result.ok) {
      const stages = patchStage(stagesRunning, "save_contacts", {
        status: "failed",
        error: result.error,
      });
      const failed =
        await updatePipelineRun(pipelineId, {
          status: "failed",
          stages,
          error: result.error,
        }) ?? run;
      return { ok: false as const, error: result.error, pipeline: failed };
    }
  }

  const stages = patchStage(stagesRunning, "save_contacts", {
    status: "completed",
    detail: `Saved ${contacts.length} contact(s)`,
  });
  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: "cold_email",
    stages,
  });
  // Must call Inner - advancePipeline would deadlock on the in-flight lock.
  return advancePipelineInner(pipelineId, options);
}

async function startColdEmailStage(pipelineId: string, run: PipelineRunRecord) {
  const stage = findStage(run, "cold_email");
  const queued = stage?.queued_prompt_run_ids ?? [];

  // Continue next batch if previous completed and more remain.
  if (stage?.prompt_run_id && queued.length > 0) {
    const nextId = queued[0];
    const nextRun = await getPromptRunById(nextId);
    if (!nextRun?.prompt_text) {
      throw new Error("Cold email batch prompt missing.");
    }
    return markAwaitingChatGpt(
      pipelineId,
      run,
      "cold_email",
      {
        prompt_run_id: nextId,
        prompt_text: nextRun.prompt_text,
        chatgpt_url: "https://chatgpt.com/",
      },
      { queued_prompt_run_ids: queued.slice(1) },
    );
  }

  const claimed = await claimPipelineStageStart(pipelineId, "cold_email");
  if (!claimed) {
    return awaitExistingChatGptStage(pipelineId, "cold_email", run);
  }

  const application = await getApplicationById(claimed.application_id);
  let exported: Awaited<ReturnType<typeof exportColdEmailsPrompt>>;
  try {
    exported = await exportColdEmailsPrompt(claimed.application_id, {
      sharedContext: application?.email_instructions ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cold email export failed.";
    if (/no eligible contacts|no cold email contacts/i.test(message)) {
      const stages = patchStage(
        patchStage(claimed.stages, "cold_email", {
          status: "skipped",
          detail: "Skipped - no contacts",
        }),
        "gmail_drafts",
        {
          status: "skipped",
          detail: "Skipped - no contacts",
        },
      );
      await updatePipelineRun(pipelineId, {
        status: "running",
        current_stage: null,
        stages,
      });
      return advancePipelineInner(pipelineId);
    }
    throw e;
  }
  const first = exported.primary;
  if (!first) {
    const stages = patchStage(
      patchStage(claimed.stages, "cold_email", {
        status: "skipped",
        detail: "Skipped - no contacts",
      }),
      "gmail_drafts",
      {
        status: "skipped",
        detail: "Skipped - no contacts",
      },
    );
    await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: null,
      stages,
    });
    return advancePipelineInner(pipelineId);
  }
  const rest = exported.additional_batches ?? [];

  return markAwaitingChatGpt(
    pipelineId,
    claimed,
    "cold_email",
    {
      prompt_run_id: first.prompt_run_id,
      prompt_text: first.prompt_text,
      chatgpt_url: first.chatgpt_url || "https://chatgpt.com/",
    },
    { queued_prompt_run_ids: rest.map((r) => r.prompt_run_id) },
  );
}

/** Wait for background Drive PDFs before attaching to Gmail drafts. */
async function waitForDrivePdfsReady(applicationId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [resume, cover] = await Promise.all([
      getLatestUsableResumeVersion(applicationId),
      getLatestUsableCoverLetterVersion(applicationId),
    ]);
    const resumeBusy = resume?.status === "uploading";
    const coverBusy = cover?.status === "uploading";
    if (!resumeBusy && !coverBusy) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function runGmailDraftsStage(pipelineId: string, run: PipelineRunRecord) {
  const existing = findStage(run, "gmail_drafts");
  if (existing?.status === "completed") {
    const done =
      run.status === "completed"
        ? run
        : await finishPipelineAndPromote(
            pipelineId,
            { status: "completed", current_stage: null, error: null },
            run,
          );
    return { ok: true as const, pipeline: done, done: true };
  }

  const stagesRunning = patchStage(run.stages, "gmail_drafts", {
    status: "running",
  });
  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: "gmail_drafts",
    stages: stagesRunning,
  });

  // Drive exports run in the background during ChatGPT stages - wait briefly
  // so Gmail attachments can attach when possible.
  await waitForDrivePdfsReady(run.application_id, 20_000);

  const emails = (await listEmails(run.application_id)).filter(
    (e) =>
      e.kind === "cold" &&
      !e.gmail_draft_id &&
      e.draft_status !== "creating" &&
      e.draft_status !== "created",
  );
  if (emails.length === 0) {
    const stages = patchStage(stagesRunning, "gmail_drafts", {
      status: "completed",
      detail: "No new drafts to create",
    });
    const done = await finishPipelineAndPromote(
      pipelineId,
      { status: "completed", current_stage: null, stages },
      run,
    );
    return { ok: true as const, pipeline: done, done: true };
  }

  const result = await createGmailDrafts(emails.map((e) => e.id));
  if (!result.ok) {
    const stages = patchStage(stagesRunning, "gmail_drafts", {
      status: "failed",
      error: result.error,
    });
    const failed = await finishPipelineAndPromote(
      pipelineId,
      {
        status: result.reconnect_required ? "needs_manual" : "failed",
        stages,
        error: result.error,
        current_stage: "gmail_drafts",
      },
      run,
    );
    return { ok: false as const, error: result.error, pipeline: failed };
  }

  const stages = patchStage(stagesRunning, "gmail_drafts", {
    status: "completed",
    detail: `Created ${result.results?.filter((r) => r.ok).length ?? emails.length} draft(s)`,
  });
  const done = await finishPipelineAndPromote(
    pipelineId,
    { status: "completed", current_stage: null, stages, error: null },
    run,
  );
  return { ok: true as const, pipeline: done, done: true };
}

async function onChatGptStageCompleted(
  pipelineId: string,
  stageId: PipelineStageId,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  let run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };

  const stage = findStage(run, stageId);
  if (stageId === "cold_email" && (stage?.queued_prompt_run_ids?.length ?? 0) > 0) {
    const stages = patchStage(run.stages, stageId, {
      status: "pending",
      detail: "More email batches remaining",
      prompt_text: null,
      repair_prompt: null,
    });
    await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: stageId,
      stages,
    });
    // Must call Inner - advancePipeline would deadlock on the in-flight lock.
    return advancePipelineInner(pipelineId, options);
  }

  const stages = patchStage(run.stages, stageId, {
    status: "completed",
    detail: "ChatGPT response accepted",
    prompt_text: null,
    repair_prompt: null,
  });
  if (stage?.prompt_run_id) {
    await completePendingExtensionRun(stage.prompt_run_id, "completed");
  }

  const order: PipelineStageId[] = [
    "jd_parse",
    "resume",
    "cover_letter",
    "save_contacts",
    "cold_email",
    "gmail_drafts",
  ];
  const idx = order.indexOf(stageId);
  const nextId = order[idx + 1] ?? null;

  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: nextId,
    stages,
    error: null,
  });

  // Let the extension delete/close ChatGPT before slow Gmail API work.
  if (options.deferGmailDrafts && nextId === "gmail_drafts") {
    const refreshed = await getPipelineRunById(pipelineId);
    return {
      ok: true as const,
      pipeline: refreshed ?? run,
      deferred_gmail: true,
    };
  }

  // Must call Inner - advancePipeline would deadlock on the in-flight lock.
  return advancePipelineInner(pipelineId, options);
}

export async function submitPipelineResponse(
  pipelineId: string,
  rawResponse: string,
) {
  const run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };
  if (!run.current_stage) {
    return { ok: false as const, error: "No active pipeline stage." };
  }

  const stage = findStage(run, run.current_stage);
  if (!stage?.prompt_run_id) {
    return { ok: false as const, error: "No prompt run for this stage." };
  }

  const result = await routeChatGptSubmit(
    run.current_stage,
    stage.prompt_run_id,
    rawResponse,
  );

  if (!result.ok) {
    const stages = patchStage(run.stages, run.current_stage, {
      status: "awaiting_chatgpt",
      error: result.error,
      repair_prompt: result.repair_prompt ?? null,
    });
    const updated =
      await updatePipelineRun(pipelineId, {
        status: "awaiting_chatgpt",
        stages,
        error: result.error,
      }) ?? run;
    return {
      ok: false as const,
      error: result.error,
      repair_prompt: result.repair_prompt,
      validation_errors: result.validation_errors,
      pipeline: updated,
    };
  }

  return onChatGptStageCompleted(pipelineId, run.current_stage);
}

export async function routeChatGptSubmit(
  stageId: PipelineStageId | string,
  promptRunId: string,
  rawResponse: string,
): Promise<{
  ok: boolean;
  error?: string;
  repair_prompt?: string;
  validation_errors?: { path: string; message: string }[];
}> {
  switch (stageId) {
    case "jd_parse":
      return submitPasteBack(promptRunId, rawResponse);
    case "resume":
      return submitResumeResponse(promptRunId, rawResponse);
    case "cover_letter":
      return submitCoverLetterResponse(promptRunId, rawResponse);
    case "cold_email":
      return submitColdEmailsResponse(promptRunId, rawResponse);
    case "follow_up": {
      const run = await getPromptRunById(promptRunId);
      if (!run?.target_entity_id) {
        return { ok: false, error: "Missing follow-up target for this prompt run." };
      }
      return submitFollowUpResponse(
        promptRunId,
        rawResponse,
        run.target_entity_id,
      );
    }
    default: {
      const run = await getPromptRunById(promptRunId);
      if (!run) return { ok: false, error: "Prompt run not found." };
      if (run.kind === "jd_parse") return submitPasteBack(promptRunId, rawResponse);
      if (run.kind === "resume") return submitResumeResponse(promptRunId, rawResponse);
      if (run.kind === "cover_letter") {
        return submitCoverLetterResponse(promptRunId, rawResponse);
      }
      if (run.kind === "cold_email") {
        return submitColdEmailsResponse(promptRunId, rawResponse);
      }
      if (run.kind === "follow_up") {
        if (!run.target_entity_id) {
          return { ok: false, error: "Missing follow-up target for this prompt run." };
        }
        return submitFollowUpResponse(
          promptRunId,
          rawResponse,
          run.target_entity_id,
        );
      }
      return submitPasteBack(promptRunId, rawResponse);
    }
  }
}

export async function skipPipelineStage(pipelineId: string) {
  const run = await getPipelineRunById(pipelineId);
  if (!run?.current_stage) {
    return { ok: false as const, error: "Nothing to skip." };
  }
  if (run.current_stage !== "jd_parse") {
    return { ok: false as const, error: "Only JD parse can be skipped." };
  }

  const stages = patchStage(run.stages, "jd_parse", {
    status: "skipped",
    detail: "Skipped by user",
    prompt_text: null,
  });
  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: "resume",
    stages,
    error: null,
  });
  return advancePipeline(pipelineId);
}

export async function retryFailedPipeline(pipelineId: string) {
  const run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };
  const failed = run.stages.find((s) => s.status === "failed");
  if (!failed) {
    return advancePipeline(pipelineId);
  }
  const stages = patchStage(run.stages, failed.id, {
    status: "pending",
    error: null,
    repair_prompt: null,
  });
  await updatePipelineRun(pipelineId, {
    status: "running",
    current_stage: failed.id,
    stages,
    error: null,
  });
  return advancePipeline(pipelineId);
}

/**
 * Resume a failed / stuck / queued pipeline from the applications list (or anywhere).
 */
export async function resumePipeline(pipelineId: string) {
  const run = await getPipelineRunById(pipelineId);
  if (!run) return { ok: false as const, error: "Pipeline not found." };

  if (run.status === "completed") {
    return { ok: true as const, pipeline: run, done: true as const };
  }

  if (run.status === "queued") {
    const busy = await listBusyPipelineRuns();
    if (busy.length > 0) {
      return {
        ok: true as const,
        pipeline: run,
        queued: true as const,
        warning: `Still queued behind ${busy.length} active application(s).`,
      };
    }
    await updatePipelineRun(pipelineId, { status: "running", error: null });
    return advancePipeline(pipelineId);
  }

  if (run.status === "failed" || run.status === "needs_manual") {
    return retryFailedPipeline(pipelineId);
  }

  const stuck = run.stages.find((s) => s.status === "running");
  if (stuck && (stuck.id === "gmail_drafts" || stuck.id === "save_contacts")) {
    const stages = patchStage(run.stages, stuck.id, {
      status: "pending",
      error: null,
      detail: "Resumed by user",
    });
    await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: stuck.id,
      stages,
      error: null,
    });
  }

  return advancePipeline(pipelineId);
}

export async function resumePipelineForApplication(applicationId: string) {
  const run = await getLatestPipelineForApplication(applicationId);
  if (!run) {
    return { ok: false as const, error: "No pipeline found for this application." };
  }
  return resumePipeline(run.id);
}

/**
 * Background tick used from any app page (and cron): advance busy pipelines,
 * promote the queue, and return a ChatGPT wake signal when needed.
 * Scoped to the current session user (browser). Cron without a session is a no-op.
 */
export async function tickGlobalPipelines() {
  const { getCurrentUser } = await import("@/lib/auth/user");
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: true as const,
      busy_count: 0,
      focus_pipeline_id: null,
      promoted_pipeline_id: null,
      wake: null,
    };
  }

  // Cheap path first - avoid promote/advance when nothing is active or queued.
  const busy = await listBusyPipelineRuns();
  const queued = busy.length === 0 ? await listQueuedPipelineRuns() : [];

  if (busy.length === 0 && queued.length === 0) {
    return {
      ok: true as const,
      busy_count: 0,
      focus_pipeline_id: null,
      promoted_pipeline_id: null,
      wake: null,
    };
  }

  const promoted = await promoteNextQueuedPipeline();
  const afterPromote = busy.length > 0 ? busy : await listBusyPipelineRuns();
  const focus = afterPromote[0] ?? null;
  let wake: {
    prompt_run_id: string;
    pipeline_run_id: string;
    kind: string;
    prompt_text: string;
    chatgpt_url: string;
  } | null = null;

  if (focus) {
    const advanced = await advancePipeline(focus.id);
    if (
      advanced.ok &&
      advanced.awaiting_chatgpt &&
      advanced.prompt_run_id &&
      advanced.prompt_text
    ) {
      await armExtensionWake(advanced.prompt_run_id, 300);
      wake = {
        prompt_run_id: advanced.prompt_run_id,
        pipeline_run_id: advanced.pipeline.id,
        kind: advanced.pipeline.current_stage || "unknown",
        prompt_text: advanced.prompt_text,
        chatgpt_url: advanced.chatgpt_url || "https://chatgpt.com/",
      };
    }
  }

  return {
    ok: true as const,
    busy_count: afterPromote.length,
    focus_pipeline_id: focus?.id ?? null,
    promoted_pipeline_id: promoted?.pipeline?.id ?? null,
    wake,
  };
}

export async function getApplicationPipelineSummaries(applicationIds: string[]) {
  const map = await listLatestPipelinesForApplications(applicationIds);
  const summaries: Record<
    string,
    {
      pipeline_id: string;
      status: string;
      current_stage: string | null;
      error: string | null;
      can_resume: boolean;
    }
  > = {};
  for (const [appId, run] of map) {
    const canResume =
      run.status === "failed" ||
      run.status === "needs_manual" ||
      run.status === "queued" ||
      run.status === "running" ||
      run.status === "awaiting_chatgpt";
    summaries[appId] = {
      pipeline_id: run.id,
      status: run.status,
      current_stage: run.current_stage,
      error: run.error,
      can_resume: canResume,
    };
  }
  return summaries;
}
