import { NextResponse } from "next/server";
import {
  completePendingExtensionRun,
  findPipelineByPromptRun,
  getPendingExtensionRun,
  updatePipelineRun,
} from "@/lib/db/pipeline";
import { getPromptRunById } from "@/lib/db/queries";
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

/**
 * Chrome extension posts ChatGPT response text here.
 * Body: { prompt_run_id, raw_response, partial?: boolean }
 */
export async function POST(request: Request) {
  if (!verifyExtensionBearer(request.headers.get("authorization"))) {
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

  const promptRun = getPromptRunById(promptRunId);
  if (!promptRun) {
    return NextResponse.json({ error: "Prompt run not found" }, { status: 404 });
  }

  const pending = getPendingExtensionRun(promptRunId);
  const stageKind = pending?.kind ?? promptRun.kind;

  const submit = await routeChatGptSubmit(stageKind, promptRunId, raw);
  if (!submit.ok) {
    completePendingExtensionRun(
      promptRunId,
      body.partial ? "timed_out" : "failed",
      submit.error,
    );

    const pipeline = findPipelineByPromptRun(promptRunId);
    if (pipeline && submit.error) {
      const stageId = pipeline.current_stage ?? stageKind;
      const stages = patchStageError(pipeline.stages, stageId, submit.error);
      updatePipelineRun(pipeline.id, {
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
        // Tell the extension NOT to reclaim / re-open ChatGPT for Google failures.
        permanent: isGoogleReconnectError(submit.error),
      },
      { status: 422 },
    );
  }

  completePendingExtensionRun(promptRunId, "completed");

  const pipeline = findPipelineByPromptRun(promptRunId);
  if (pipeline && pipeline.status === "awaiting_chatgpt") {
    // Do not await — Gmail drafts / Drive work can take many seconds and would
    // block the extension from deleting the ChatGPT session and closing the tab.
    void advancePipeline(pipeline.id).catch((err) => {
      console.error("[paste-back] advancePipeline failed", err);
    });
  }

  return NextResponse.json({
    ok: true,
    prompt_run_id: promptRunId,
    pipeline_run_id: pipeline?.id ?? null,
  });
}
