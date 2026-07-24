import { NextResponse } from "next/server";
import {
  completePendingExtensionRun,
  findPipelineByPromptRun,
  getPendingExtensionRun,
  updatePipelineRun,
} from "@/lib/db/pipeline";
import { dbGet } from "@/lib/db";
import { getPromptRunById } from "@/lib/db/queries";
import { runAsUser } from "@/lib/auth/request-user";
import { verifyExtensionBearer } from "@/lib/extension/tokens";
import {
  advancePipeline,
  routeChatGptSubmit,
} from "@/app/actions/pipeline";
import { isGoogleReconnectError } from "@/lib/google/reconnect";
import type { PipelineStage } from "@/lib/pipeline/types";

function patchStageError(
  stages: PipelineStage[],
  stageId: string,
  error: string,
): PipelineStage[] {
  return stages.map((s) =>
    s.id === stageId
      ? {
          ...s,
          status: "awaiting_chatgpt" as const,
          error,
          detail: isGoogleReconnectError(error)
            ? "Reconnect Google to finish Drive export"
            : s.detail,
        }
      : s,
  );
}

async function promptOwnedByUser(
  promptRunId: string,
  userId: string,
): Promise<boolean> {
  const row = (await dbGet(
    `SELECT user_id FROM prompt_runs WHERE id = ?`,
    promptRunId,
  )) as { user_id: string | null } | undefined;
  return Boolean(row?.user_id && row.user_id === userId);
}

/**
 * Chrome extension posts ChatGPT response text here.
 * Body: { prompt_run_id, raw_response, partial?: boolean }
 */
export async function POST(request: Request) {
  const auth = await verifyExtensionBearer(
    request.headers.get("authorization"),
  );
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    prompt_run_id?: string;
    raw_response?: string;
    partial?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const promptRunId = body.prompt_run_id?.trim();
  const raw = body.raw_response ?? "";
  if (!promptRunId) {
    return NextResponse.json(
      { error: "prompt_run_id is required" },
      { status: 400 },
    );
  }
  if (!raw.trim()) {
    return NextResponse.json(
      { error: "raw_response is empty" },
      { status: 400 },
    );
  }

  if (!(await promptOwnedByUser(promptRunId, auth.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return runAsUser(auth.userId, async () => {
    const promptRun = await getPromptRunById(promptRunId);
    if (!promptRun) {
      return NextResponse.json({ error: "Prompt run not found" }, { status: 404 });
    }

    const pending = await getPendingExtensionRun(promptRunId);
    const stageKind = pending?.kind ?? promptRun.kind;

    const submit = await routeChatGptSubmit(stageKind, promptRunId, raw);
    if (!submit.ok) {
      await completePendingExtensionRun(
        promptRunId,
        body.partial ? "timed_out" : "failed",
        submit.error,
      );

      const pipeline = await findPipelineByPromptRun(promptRunId);
      if (pipeline && submit.error) {
        const stageId = pipeline.current_stage ?? stageKind;
        const stages = patchStageError(pipeline.stages, stageId, submit.error);
        await updatePipelineRun(pipeline.id, {
          status: "awaiting_chatgpt",
          stages,
          error: submit.error,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: submit.error,
          repair_prompt: submit.repair_prompt,
          validation_errors: submit.validation_errors,
          partial: Boolean(body.partial),
          upload_failed: Boolean(
            (submit as { upload_failed?: boolean }).upload_failed,
          ),
          reconnect_required:
            Boolean((submit as { reconnect_required?: boolean }).reconnect_required) ||
            isGoogleReconnectError(submit.error),
          permanent: isGoogleReconnectError(submit.error),
        },
        { status: 422 },
      );
    }

    await completePendingExtensionRun(promptRunId, "completed");

    const pipeline = await findPipelineByPromptRun(promptRunId);
    let nextPending: {
      prompt_run_id: string;
      pipeline_run_id: string;
      kind: string;
      prompt_text: string;
      chatgpt_url: string;
    } | null = null;

    if (pipeline && pipeline.status === "awaiting_chatgpt") {
      try {
        const advanced = await advancePipeline(pipeline.id, {
          deferGmailDrafts: true,
        });
        if (
          advanced.ok &&
          advanced.awaiting_chatgpt &&
          advanced.prompt_run_id &&
          advanced.prompt_text &&
          advanced.prompt_run_id !== promptRunId
        ) {
          nextPending = {
            prompt_run_id: advanced.prompt_run_id,
            pipeline_run_id: advanced.pipeline.id,
            kind: advanced.pipeline.current_stage || "unknown",
            prompt_text: advanced.prompt_text,
            chatgpt_url: advanced.chatgpt_url || "https://chatgpt.com/",
          };
        }

        if (advanced.ok && advanced.deferred_gmail) {
          void advancePipeline(pipeline.id).catch((err) => {
            console.error("[paste-back] deferred gmail_drafts failed", err);
          });
        }
      } catch (err) {
        console.error("[paste-back] advancePipeline failed", err);
      }
    }

    return NextResponse.json({
      ok: true,
      prompt_run_id: promptRunId,
      pipeline_run_id: pipeline?.id ?? null,
      next_pending: nextPending,
    });
  });
}
