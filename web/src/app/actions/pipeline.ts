"use server";

import { after } from "next/server";
import { z } from "zod";
import { exportJdParsePrompt } from "@/app/actions/applications";
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
import { writeAuditLog } from "@/lib/audit";
import { runAsUser } from "@/lib/auth/request-user";
import { sanitizeJd } from "@/lib/jd/sanitize";
import { truncateJdIfNeeded } from "@/lib/tracker/jd";
import {
  claimNextQueuedPipeline,
  claimPipelineStageStart,
  completePendingExtensionRun,
  failStaleBusyPipelines,
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
  getPromptRunById,
  insertApplication,
  insertContact,
  listContacts,
  listCoverLetterVersions,
  listEmails,
  listResumeVersions,
  updateApplicationEmailInstructions,
} from "@/lib/db/queries";
import type {
  PipelineContactInput,
  PipelineLlmEngine,
  PipelineRunRecord,
  PipelineStage,
  PipelineStageId,
} from "@/lib/pipeline/types";
import {
  getPipelineLlmEngine,
  stageNeedsLlm,
} from "@/lib/pipeline/types";
import {
  generateWithOpenAI,
  maxTokensForStage,
  friendlyOpenAiApiError,
} from "@/lib/llm/openai";

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
  skip_cover_letter: z.boolean().optional(),
  llm_engine: z.enum(["chatgpt", "openai"]).optional().default("openai"),
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
  // Arm immediately so JobApp Bridge can open AI for this stage
  // (including JD parse) without waiting on a separate client-only step.
  await armExtensionWake(promptRunId, 300);
}

async function savePipelineContactsNow(
  applicationId: string,
  contacts: PipelineContactInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Insert directly — avoid saveManualContact revalidatePath per contact (slow start).
  for (const c of contacts) {
    try {
      await insertContact({
        application_id: applicationId,
        name: c.name,
        email: c.email,
        role: c.role ?? null,
        linkedin_url: c.linkedin_url || null,
        email_source: "manual_entry",
        verification_status: "unverified",
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to save contact.",
      };
    }
  }
  return { ok: true };
}

async function bootstrapAndAdvancePipeline(input: {
  application_id: string;
  contacts: PipelineContactInput[];
  skip_jd_parse?: boolean;
  skip_cover_letter?: boolean;
  contacts_already_saved?: boolean;
  llm_engine?: PipelineLlmEngine;
}) {
  let contactsAlreadySaved = Boolean(input.contacts_already_saved);
  const llmEngine = input.llm_engine ?? "openai";

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
    llm_engine: llmEngine,
  });

  let stages = pipeline.stages;

  if (input.skip_jd_parse) {
    stages = patchStage(stages, "jd_parse", {
      status: "skipped",
      detail: "Skipped - company/role already set",
    });
  }

  if (input.skip_cover_letter) {
    stages = patchStage(stages, "cover_letter", {
      status: "skipped",
      detail: "Skipped - not needed for this application",
    });
  }

  if (input.contacts.length === 0) {
    stages = skipContactEmailStages(stages);
  } else if (contactsAlreadySaved) {
    stages = patchStage(stages, "save_contacts", {
      status: "completed",
      detail: "Contacts saved",
    });
  }

  const nextStage: PipelineStageId = input.skip_jd_parse ? "resume" : "jd_parse";

  // Classic Bridge path must stay serial (one AI tab). OpenAI Apply can start
  // immediately — including when a prior OpenAI run is stuck.
  if (llmEngine !== "openai") {
    await failStaleBusyPipelines();
  }
  const busyAll =
    llmEngine === "openai" ? [] : await listBusyPipelineRuns();
  const busy =
    llmEngine === "openai"
      ? []
      : busyAll.filter((b) => getPipelineLlmEngine(b) === "chatgpt");

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
      warning: `Queued behind ${busy.length} active AI application(s). It will start automatically when the current one finishes.`,
    };
  }

  pipeline =
    await updatePipelineRun(pipeline.id, {
      stages,
      current_stage: nextStage,
      status: "running",
    }) ?? pipeline;

  // OpenAI stages can take minutes - let the pipeline page tick start them
  // so Quick Apply submit returns immediately.
  if (llmEngine === "openai") {
    return {
      ok: true as const,
      pipeline_id: pipeline.id,
      application_id: input.application_id,
      queued: false as const,
      advance: { ok: true as const, pipeline },
    };
  }

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
    // Lean create: skip similar-app scan + sync revalidate (those made Start feel stuck).
    const jdSanitized = sanitizeJd(parsed.data.jd);
    const { text: jdRaw, truncated: jdTruncated } = truncateJdIfNeeded(jdSanitized);
    if (jdRaw.length < 50) {
      return {
        ok: false as const,
        error:
          "Job description must be at least 50 characters after cleaning HTML and extra whitespace.",
      };
    }

    const applicationId = await insertApplication({
      company: parsed.data.company,
      role: parsed.data.role,
      job_url: parsed.data.job_url || null,
      jd_raw: jdRaw,
      notes: parsed.data.notes,
      email_instructions: parsed.data.email_instructions,
    });

    after(() => {
      void writeAuditLog("application.created", "applications", applicationId, {
        company: parsed.data.company ?? null,
        role: parsed.data.role ?? null,
        jd_truncated: jdTruncated,
      }).catch((err) => {
        console.error("[pipeline] audit after start failed", err);
      });
    });

    const result = await bootstrapAndAdvancePipeline({
      application_id: applicationId,
      contacts: parsed.data.contacts,
      skip_jd_parse: parsed.data.skip_jd_parse === true,
      skip_cover_letter: parsed.data.skip_cover_letter === true,
      contacts_already_saved: false,
      llm_engine: parsed.data.llm_engine ?? "openai",
    });

    return {
      ...result,
      similar_applications: [] as const,
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
      llm_engine: "openai",
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
  /**
   * After an AI stage succeeds, return before starting the next LLM stage
   * (Classic Bridge paste-back). OpenAI Apply chains stages in one advance.
   */
  yieldBeforeNextAi?: boolean;
  /** Override the stage completion detail line. */
  completionDetail?: string;
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
 * Drive the pipeline forward. For AI stages, exports a prompt and pauses
 * in awaiting_chatgpt until submitPipelineResponse / extension paste-back.
 *
 * Concurrent callers (UI poll + paste-back) share one in-flight promise so
 * gmail_drafts cannot be marked completed while still running.
 */
const advancingPipelines = new Map<string, Promise<AdvanceResult>>();

async function promoteNextQueuedPipeline(
  userId?: string,
): Promise<AdvanceResult | null> {
  const claimed = await claimNextQueuedPipeline(userId);
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
  // Pass userId so promote never needs cookies() (may run after response / after()).
  void promoteNextQueuedPipeline(updated.user_id).catch((err) => {
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

  const promise = (async () => {
    // Bind ALS userId for the whole advance so nested DB/Drive work never
    // needs cookies() — critical after resume/cover schedule after().
    const seed = await getPipelineRunById(pipelineId);
    if (!seed) return { ok: false as const, error: "Pipeline not found." };
    return runAsUser(seed.user_id, () =>
      advancePipelineInner(pipelineId, options),
    );
  })().finally(() => {
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
  if (run.status === "needs_manual") {
    return {
      ok: false as const,
      error: run.error ?? "Pipeline needs manual action (e.g. reconnect Google).",
      pipeline: run,
    };
  }

  // If waiting on AI, check whether the prompt run completed (extension path).
  if (run.status === "awaiting_chatgpt" && run.current_stage) {
    const currentStage = run.current_stage;
    const stage = findStage(run, currentStage);
    if (stage?.prompt_run_id) {
      // Resume/cover letter may have valid AI JSON already saved as
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
        // Advance once AI content is accepted. Drive PDFs finish in the background.
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
    // Another isolate may have claimed a AI stage and still be exporting -
    // wait for awaiting_chatgpt so paste-back can chain the next tab.
    if (
      runningStage.id === "jd_parse" ||
      runningStage.id === "resume" ||
      runningStage.id === "cover_letter" ||
      runningStage.id === "cold_email"
    ) {
      if (getPipelineLlmEngine(run) === "openai") {
        // Another tick / isolate may see "running" while OpenAI generation is
        // still in flight. Do NOT fail it as orphaned unless it's stale —
        // otherwise polls abort a live curl and leave status/stage inconsistent.
        if (runningStage.prompt_run_id) {
          const promptRun = await getPromptRunById(runningStage.prompt_run_id);
          if (promptRun?.status === "completed") {
            return onChatGptStageCompleted(pipelineId, runningStage.id, options);
          }
        }
        const updatedTs = Date.parse(
          String(run.updated_at).includes("T")
            ? String(run.updated_at)
            : `${String(run.updated_at).replace(" ", "T")}Z`,
        );
        const ageMs = Number.isFinite(updatedTs)
          ? Date.now() - updatedTs
          : 0;
        // Resume can take ~2 min + one retry; allow ~5 min before declaring stuck.
        if (ageMs < 5 * 60_000) {
          return { ok: true as const, pipeline: run };
        }
        const stages = patchStage(run.stages, runningStage.id, {
          status: "failed",
          error: "This took too long. Please retry.",
          detail: "Failed",
        });
        run = await finishPipelineAndPromote(
          pipelineId,
          {
            status: "failed",
            current_stage: runningStage.id,
            stages,
            error: "This took too long. Please retry.",
          },
          run,
        );
        return {
          ok: false as const,
          error: run.error ?? "This took too long. Please retry.",
          pipeline: run,
        };
      }
      return awaitExistingChatGptStage(pipelineId, runningStage.id, run);
    }
    // Drive PDF wait / Gmail draft creation — continue instead of resetting.
    if (runningStage.id === "gmail_drafts") {
      return runGmailDraftsStage(pipelineId, run);
    }
    // Non-AI stage left mid-flight (serverless timeout / tab closed) - retry.
    const stages = patchStage(run.stages, runningStage.id, {
      status: "pending",
      error: null,
      detail: "Retrying after interrupted run",
    });
    run =
      (await updatePipelineRun(pipelineId, {
        status: "running",
        current_stage: runningStage.id,
        stages,
        error: null,
      })) ?? run;
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

/** True when AI stage content is accepted (Drive may still be uploading). */
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

async function runAiStageWithOpenAI(
  pipelineId: string,
  run: PipelineRunRecord,
  stageId: PipelineStageId,
  exported: {
    prompt_run_id: string;
    prompt_text: string;
    chatgpt_url?: string;
  },
  extra?: Partial<PipelineStage>,
): Promise<AdvanceResult> {
  let stages = patchStage(run.stages, stageId, {
    status: "running",
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url ?? null,
    detail: "Writing…",
    error: null,
    repair_prompt: null,
    ...extra,
  });
  let current =
    (await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: stageId,
      stages,
      error: null,
    })) ?? run;

  let promptText = exported.prompt_text;
  let lastError = "This step failed. Please retry.";
  // Schema repair only — never used for API timeouts/500s (those already retry inside generateWithOpenAI).
  const maxSchemaRepairRounds = 1;

  for (let attempt = 0; attempt <= maxSchemaRepairRounds; attempt++) {
    try {
      stages = patchStage(current.stages, stageId, {
        detail: attempt === 0 ? "Writing…" : "Fixing AI reply…",
        repair_prompt: attempt > 0 ? promptText : null,
        error: null,
      });
      current =
        (await updatePipelineRun(pipelineId, { stages, error: null })) ??
        current;

      const generated = await generateWithOpenAI({
        prompt: promptText,
        kind: stageId,
        maxTokens: maxTokensForStage(stageId),
        onAttempt: async ({ attempt: apiAttempt, maxAttempts }) => {
          const detail =
            apiAttempt === 1
              ? attempt === 0
                ? "Writing…"
                : "Fixing AI reply…"
              : `Trying again (${apiAttempt}/${maxAttempts})…`;
          const patched = patchStage(current.stages, stageId, { detail });
          current =
            (await updatePipelineRun(pipelineId, { stages: patched })) ??
            current;
        },
      });

      const result = await routeChatGptSubmit(
        stageId,
        exported.prompt_run_id,
        generated.content,
      );
      if (result.ok) {
        return onChatGptStageCompleted(pipelineId, stageId, {
          // Chain next stages immediately - no poll gaps between LLM calls.
          yieldBeforeNextAi: false,
          completionDetail: "Done",
        });
      }

      // Submit reported failure, but artifacts may already be saved (side-effect throw).
      if (stageId === "resume" || stageId === "cover_letter") {
        const versions =
          stageId === "resume"
            ? await listResumeVersions(run.application_id)
            : await listCoverLetterVersions(run.application_id);
        const linked = versions.find(
          (v) =>
            v.prompt_run_id === exported.prompt_run_id &&
            (v.status === "ready" || v.status === "uploading"),
        );
        if (linked) {
          console.warn(
            `[pipeline] ${stageId} submit returned not-ok but artifact exists; continuing`,
            result.error,
          );
          return onChatGptStageCompleted(pipelineId, stageId, {
            yieldBeforeNextAi: false,
            completionDetail: "Done",
          });
        }
      }

      lastError =
        result.error?.trim() ||
        "The AI reply wasn't usable. Please retry.";
      if (result.repair_prompt && attempt < maxSchemaRepairRounds) {
        promptText = result.repair_prompt;
        stages = patchStage(current.stages, stageId, {
          error: lastError,
          repair_prompt: result.repair_prompt,
          detail: "Fixing AI reply…",
        });
        current =
          (await updatePipelineRun(pipelineId, {
            stages,
            error: lastError,
          })) ?? current;
        continue;
      }
      break;
    } catch (e) {
      // API already exhausted its own retries — fail the stage; do not outer-loop.
      const raw = e instanceof Error ? e.message : String(e);
      lastError = friendlyOpenAiApiError(raw);
      break;
    }
  }

  stages = patchStage(current.stages, stageId, {
    status: "failed",
    error: lastError,
    detail: "Failed",
  });
  const failed = await finishPipelineAndPromote(
    pipelineId,
    {
      status: "failed",
      current_stage: stageId,
      stages,
      error: lastError,
    },
    current,
  );
  return { ok: false as const, error: lastError, pipeline: failed };
}

async function startJdParseStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "jd_parse");
  if (!claimed) {
    if (getPipelineLlmEngine(run) === "openai") {
      return { ok: true as const, pipeline: run };
    }
    return awaitExistingChatGptStage(pipelineId, "jd_parse", run);
  }
  const exported = await exportJdParsePrompt(claimed.application_id);
  if (getPipelineLlmEngine(claimed) === "openai") {
    return runAiStageWithOpenAI(pipelineId, claimed, "jd_parse", exported);
  }
  return markAwaitingChatGpt(pipelineId, claimed, "jd_parse", exported);
}

async function startResumeStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "resume");
  if (!claimed) {
    if (getPipelineLlmEngine(run) === "openai") {
      return { ok: true as const, pipeline: run };
    }
    return awaitExistingChatGptStage(pipelineId, "resume", run);
  }
  const exported = await exportResumePrompt(claimed.application_id);
  if (getPipelineLlmEngine(claimed) === "openai") {
    return runAiStageWithOpenAI(pipelineId, claimed, "resume", {
      prompt_run_id: exported.prompt_run_id,
      prompt_text: exported.prompt_text,
      chatgpt_url: exported.chatgpt_url,
    });
  }
  return markAwaitingChatGpt(pipelineId, claimed, "resume", {
    prompt_run_id: exported.prompt_run_id,
    prompt_text: exported.prompt_text,
    chatgpt_url: exported.chatgpt_url,
  });
}

async function startCoverLetterStage(pipelineId: string, run: PipelineRunRecord) {
  const claimed = await claimPipelineStageStart(pipelineId, "cover_letter");
  if (!claimed) {
    if (getPipelineLlmEngine(run) === "openai") {
      return { ok: true as const, pipeline: run };
    }
    return awaitExistingChatGptStage(pipelineId, "cover_letter", run);
  }
  const exported = await exportCoverLetterPrompt(claimed.application_id);
  if (getPipelineLlmEngine(claimed) === "openai") {
    return runAiStageWithOpenAI(pipelineId, claimed, "cover_letter", {
      prompt_run_id: exported.prompt_run_id,
      prompt_text: exported.prompt_text,
      chatgpt_url: exported.chatgpt_url,
    });
  }
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
    current_stage: null,
    stages,
  });
  // Must call Inner - advancePipeline would deadlock on the in-flight lock.
  return advancePipelineInner(pipelineId, options);
}

async function startColdEmailStage(pipelineId: string, run: PipelineRunRecord) {
  const stage = findStage(run, "cold_email");
  const queued = stage?.queued_prompt_run_ids ?? [];
  const useOpenAiEngine = getPipelineLlmEngine(run) === "openai";

  // Continue next batch if previous completed and more remain.
  if (stage?.prompt_run_id && queued.length > 0) {
    const nextId = queued[0];
    const nextRun = await getPromptRunById(nextId);
    if (!nextRun?.prompt_text) {
      throw new Error("Cold email batch prompt missing.");
    }
    const exported = {
      prompt_run_id: nextId,
      prompt_text: nextRun.prompt_text,
      chatgpt_url: "https://chatgpt.com/",
    };
    const extra = { queued_prompt_run_ids: queued.slice(1) };
    if (useOpenAiEngine) {
      return runAiStageWithOpenAI(
        pipelineId,
        run,
        "cold_email",
        exported,
        extra,
      );
    }
    return markAwaitingChatGpt(
      pipelineId,
      run,
      "cold_email",
      exported,
      extra,
    );
  }

  const claimed = await claimPipelineStageStart(pipelineId, "cold_email");
  if (!claimed) {
    if (useOpenAiEngine) return { ok: true as const, pipeline: run };
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
  const batchExtra = {
    queued_prompt_run_ids: rest.map((r) => r.prompt_run_id),
  };
  const batchExport = {
    prompt_run_id: first.prompt_run_id,
    prompt_text: first.prompt_text,
    chatgpt_url: first.chatgpt_url || "https://chatgpt.com/",
  };

  if (getPipelineLlmEngine(claimed) === "openai") {
    return runAiStageWithOpenAI(
      pipelineId,
      claimed,
      "cold_email",
      batchExport,
      batchExtra,
    );
  }

  return markAwaitingChatGpt(
    pipelineId,
    claimed,
    "cold_email",
    batchExport,
    batchExtra,
  );
}

/** Wait for background Drive PDFs before attaching to Gmail drafts. */
type DrivePdfGate =
  | { status: "ready" }
  | { status: "waiting"; detail: string }
  | { status: "failed"; error: string };

function expectCoverLetterPdf(run: PipelineRunRecord): boolean {
  const cover = findStage(run, "cover_letter");
  return Boolean(cover && cover.status !== "skipped");
}

function artifactCreatedAtMs(createdAt: string | undefined): number {
  if (!createdAt) return Date.now();
  const raw = String(createdAt);
  const ts = Date.parse(
    raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`,
  );
  return Number.isFinite(ts) ? ts : Date.now();
}

/**
 * Resume (and cover letter when that stage ran) must be Drive-ready with a PDF
 * id before Gmail drafts. Upload failures / stuck uploads fail the gate.
 */
async function checkDrivePdfsForDrafts(
  applicationId: string,
  expectCover: boolean,
): Promise<DrivePdfGate> {
  const STUCK_MS = 5 * 60_000;
  const resumes = await listResumeVersions(applicationId);
  const latestResume = resumes[0] ?? null;

  if (!latestResume) {
    return { status: "waiting", detail: "Waiting for resume PDF…" };
  }
  if (latestResume.status === "uploading") {
    if (Date.now() - artifactCreatedAtMs(latestResume.created_at) > STUCK_MS) {
      return {
        status: "failed",
        error:
          "Resume PDF upload to Drive is taking too long. Reconnect Google and retry.",
      };
    }
    return { status: "waiting", detail: "Uploading resume PDF to Drive…" };
  }
  if (latestResume.status === "upload_failed") {
    return {
      status: "failed",
      error:
        "Resume PDF failed to upload to Drive. Reconnect Google and retry.",
    };
  }
  if (latestResume.status !== "ready" || !latestResume.drive_pdf_id) {
    return {
      status: "failed",
      error: "Resume PDF is not available on Drive yet. Please retry.",
    };
  }

  if (!expectCover) {
    return { status: "ready" };
  }

  const covers = await listCoverLetterVersions(applicationId);
  const latestCover = covers[0] ?? null;
  if (!latestCover) {
    return { status: "waiting", detail: "Waiting for cover letter PDF…" };
  }
  if (latestCover.status === "uploading") {
    if (Date.now() - artifactCreatedAtMs(latestCover.created_at) > STUCK_MS) {
      return {
        status: "failed",
        error:
          "Cover letter PDF upload to Drive is taking too long. Reconnect Google and retry.",
      };
    }
    return {
      status: "waiting",
      detail: "Uploading cover letter PDF to Drive…",
    };
  }
  if (latestCover.status === "upload_failed") {
    return {
      status: "failed",
      error:
        "Cover letter PDF failed to upload to Drive. Reconnect Google and retry.",
    };
  }
  if (latestCover.status !== "ready" || !latestCover.drive_pdf_id) {
    return {
      status: "failed",
      error: "Cover letter PDF is not available on Drive yet. Please retry.",
    };
  }

  return { status: "ready" };
}

/**
 * Poll until Drive PDFs are ready, or fail. Yields after ~45s so serverless
 * ticks can resume without dropping the wait.
 */
async function waitForDrivePdfsBeforeDrafts(
  pipelineId: string,
  run: PipelineRunRecord,
  stagesRunning: PipelineStage[],
): Promise<
  | { ok: true; ready: true; stages: PipelineStage[]; run: PipelineRunRecord }
  | { ok: true; ready: false; pipeline: PipelineRunRecord }
  | { ok: false; error: string; pipeline: PipelineRunRecord }
> {
  const expectCover = expectCoverLetterPdf(run);
  const budgetMs = 45_000;
  const started = Date.now();
  let stages = stagesRunning;
  let current = run;

  while (Date.now() - started < budgetMs) {
    const gate = await checkDrivePdfsForDrafts(run.application_id, expectCover);
    if (gate.status === "ready") {
      return { ok: true, ready: true, stages, run: current };
    }
    if (gate.status === "failed") {
      stages = patchStage(stages, "gmail_drafts", {
        status: "failed",
        error: gate.error,
        detail: "Failed",
      });
      const failed = await finishPipelineAndPromote(
        pipelineId,
        {
          status: "needs_manual",
          current_stage: "gmail_drafts",
          stages,
          error: gate.error,
        },
        current,
      );
      return { ok: false, error: gate.error, pipeline: failed };
    }

    stages = patchStage(stages, "gmail_drafts", {
      status: "running",
      detail: gate.detail,
      error: null,
    });
    current =
      (await updatePipelineRun(pipelineId, {
        status: "running",
        current_stage: "gmail_drafts",
        stages,
        error: null,
      })) ?? current;

    await new Promise((r) => setTimeout(r, 2000));
  }

  // Still uploading — leave stage running so the next advance tick continues.
  const gate = await checkDrivePdfsForDrafts(run.application_id, expectCover);
  if (gate.status === "ready") {
    return { ok: true, ready: true, stages, run: current };
  }
  if (gate.status === "failed") {
    stages = patchStage(stages, "gmail_drafts", {
      status: "failed",
      error: gate.error,
      detail: "Failed",
    });
    const failed = await finishPipelineAndPromote(
      pipelineId,
      {
        status: "needs_manual",
        current_stage: "gmail_drafts",
        stages,
        error: gate.error,
      },
      current,
    );
    return { ok: false, error: gate.error, pipeline: failed };
  }

  stages = patchStage(stages, "gmail_drafts", {
    status: "running",
    detail: gate.detail,
    error: null,
  });
  current =
    (await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: "gmail_drafts",
      stages,
      error: null,
    })) ?? current;
  return { ok: true, ready: false, pipeline: current };
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
    detail: existing?.detail?.includes("Drive")
      ? existing.detail
      : "Waiting for Drive PDFs…",
    error: null,
  });
  let current =
    (await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: "gmail_drafts",
      stages: stagesRunning,
      error: null,
    })) ?? run;

  const waited = await waitForDrivePdfsBeforeDrafts(
    pipelineId,
    current,
    stagesRunning,
  );
  if (!waited.ok) {
    return {
      ok: false as const,
      error: waited.error,
      pipeline: waited.pipeline,
    };
  }
  if (!waited.ready) {
    // PDFs still uploading — next pipeline tick will resume this stage.
    return { ok: true as const, pipeline: waited.pipeline };
  }

  current = waited.run;
  const stagesAfterWait = waited.stages;
  const stagesCreating = patchStage(stagesAfterWait, "gmail_drafts", {
    status: "running",
    detail: "Creating Gmail drafts…",
  });
  current =
    (await updatePipelineRun(pipelineId, {
      status: "running",
      current_stage: "gmail_drafts",
      stages: stagesCreating,
    })) ?? current;

  const emails = (await listEmails(current.application_id)).filter(
    (e) =>
      e.kind === "cold" &&
      !e.gmail_draft_id &&
      e.draft_status !== "creating" &&
      e.draft_status !== "created",
  );
  if (emails.length === 0) {
    const stages = patchStage(stagesCreating, "gmail_drafts", {
      status: "completed",
      detail: "No new drafts to create",
    });
    const done = await finishPipelineAndPromote(
      pipelineId,
      { status: "completed", current_stage: null, stages },
      current,
    );
    return { ok: true as const, pipeline: done, done: true };
  }

  const result = await createGmailDrafts(emails.map((e) => e.id));
  if (!result.ok) {
    const stages = patchStage(stagesCreating, "gmail_drafts", {
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
      current,
    );
    return { ok: false as const, error: result.error, pipeline: failed };
  }

  const stages = patchStage(stagesCreating, "gmail_drafts", {
    status: "completed",
    detail: `Created ${result.results?.filter((r) => r.ok).length ?? emails.length} draft(s)`,
  });
  const done = await finishPipelineAndPromote(
    pipelineId,
    { status: "completed", current_stage: null, stages, error: null },
    current,
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
    if (options.yieldBeforeNextAi) {
      const refreshed = await getPipelineRunById(pipelineId);
      return { ok: true as const, pipeline: refreshed ?? run };
    }
    // Must call Inner - advancePipeline would deadlock on the in-flight lock.
    return advancePipelineInner(pipelineId, options);
  }

  const stages = patchStage(run.stages, stageId, {
    status: "completed",
    detail: options.completionDetail ?? "AI response accepted",
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

  // Let the extension delete/close AI before slow Gmail API work.
  if (options.deferGmailDrafts && nextId === "gmail_drafts") {
    const refreshed = await getPipelineRunById(pipelineId);
    return {
      ok: true as const,
      pipeline: refreshed ?? run,
      deferred_gmail: true,
    };
  }

  // Optional yield between LLM stages so each client tick runs one generation.
  if (
    options.yieldBeforeNextAi &&
    nextId &&
    stageNeedsLlm(nextId)
  ) {
    const refreshed = await getPipelineRunById(pipelineId);
    return { ok: true as const, pipeline: refreshed ?? run };
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

  // If resume/cover letter already produced a usable artifact, mark done and continue.
  if (
    (failed.id === "resume" || failed.id === "cover_letter") &&
    failed.prompt_run_id
  ) {
    const versions =
      failed.id === "resume"
        ? await listResumeVersions(run.application_id)
        : await listCoverLetterVersions(run.application_id);
    const linked = versions.find(
      (v) =>
        v.prompt_run_id === failed.prompt_run_id &&
        (v.status === "ready" || v.status === "uploading"),
    );
    if (linked) {
      const stages = patchStage(run.stages, failed.id, {
        status: "completed",
        error: null,
        detail: "Done",
        repair_prompt: null,
      });
      const order: PipelineStageId[] = [
        "jd_parse",
        "resume",
        "cover_letter",
        "cold_email",
        "gmail_drafts",
      ];
      const nextId = order[order.indexOf(failed.id) + 1] ?? null;
      await updatePipelineRun(pipelineId, {
        status: "running",
        current_stage: nextId,
        stages,
        error: null,
      });
      return advancePipeline(pipelineId);
    }
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
    await failStaleBusyPipelines();
    const busyAll = await listBusyPipelineRuns();
    const busy = busyAll.filter((b) => getPipelineLlmEngine(b) === "chatgpt");
    if (busy.length > 0) {
      return {
        ok: true as const,
        pipeline: run,
        queued: true as const,
        warning: `Still queued behind ${busy.length} active AI application(s).`,
      };
    }
    await updatePipelineRun(pipelineId, { status: "running", error: null });
    return advancePipeline(pipelineId);
  }

  if (run.status === "failed" || run.status === "needs_manual") {
    return retryFailedPipeline(pipelineId);
  }

  // Stuck mid-flight (tab closed, timed-out AI call, etc.) — reset and retry.
  const stuck = run.stages.find(
    (s) =>
      s.status === "running" ||
      s.status === "awaiting_chatgpt" ||
      s.status === "failed",
  );
  if (stuck) {
    const stages = patchStage(run.stages, stuck.id, {
      status: "pending",
      error: null,
      detail: "Retrying…",
      repair_prompt: null,
      prompt_text: null,
      chatgpt_url: null,
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
 * promote the queue, and return a AI wake signal when needed.
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
  await failStaleBusyPipelines();
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

  const promoted = await promoteNextQueuedPipeline(user.id);
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
    // Server-LLM (Apply) pipelines: don't start a second advance while an AI
    // stage is mid-generation (that races). But DO advance when the next stage
    // is only pending — otherwise yield gaps leave pipelines stalled.
    if (getPipelineLlmEngine(focus) === "openai") {
      const liveAi = focus.stages.find(
        (s) =>
          (s.status === "running" || s.status === "awaiting_chatgpt") &&
          stageNeedsLlm(s.id),
      );
      if (liveAi) {
        return {
          ok: true as const,
          busy_count: afterPromote.length,
          focus_pipeline_id: focus.id,
          promoted_pipeline_id: promoted?.pipeline?.id ?? null,
          wake: null,
        };
      }
    }

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
