"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { applyJdParseResult } from "@/app/actions/applications";
import {
  abandonPromptRunRow,
  completePromptRun,
  createPromptRun,
  getActivePromptTemplate,
  getPromptRunById,
  listRecentPromptRuns,
  updatePromptRunText,
  updatePromptRunValidationErrors,
} from "@/lib/db/queries";
import type { PromptRunKind } from "@/lib/db/types";
import {
  composePrompt,
  warnIfPromptTooLong,
} from "@/lib/prompt/composer";
import {
  extractJsonFromText,
  parsePromptRunMarker,
} from "@/lib/prompt/json-extract";
import { buildRepairPrompt, zodErrorsToList } from "@/lib/prompt/repair";
import { SCHEMAS_BY_KIND } from "@/lib/prompt/schemas";

export async function exportPrompt(
  templateKey: string,
  context: Record<string, string>,
) {
  const template = await getActivePromptTemplate(templateKey);
  if (!template) {
    throw new Error(`No active template found for kind: ${templateKey}`);
  }

  const runId = await createPromptRun(templateKey as PromptRunKind);
  const promptText = composePrompt(template, context, runId);
  const lengthWarning = warnIfPromptTooLong(promptText);

  await updatePromptRunText(runId, promptText);

  await writeAuditLog("prompt.exported", "prompt_runs", runId, {
    kind: templateKey,
  });

  return {
    prompt_run_id: runId,
    prompt_text: promptText,
    length_warning: lengthWarning,
    chatgpt_url: "https://chat.openai.com/",
  };
}

export async function submitPasteBack(promptRunId: string, rawResponse: string) {
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
      error: `This response belongs to a different prompt run (${markerId}). Please paste into the correct modal.`,
    };
  }

  const existing = await getPromptRunById(promptRunId);
  if (!existing) {
    return { ok: false as const, error: "Prompt run not found." };
  }

  if (existing.status === "completed") {
    return {
      ok: true as const,
      already_completed: true,
      parsed: existing.parsed_response,
    };
  }

  const schema = SCHEMAS_BY_KIND[existing.kind];
  if (!schema) {
    return {
      ok: false as const,
      error: `No validator registered for kind: ${existing.kind}`,
    };
  }

  let jsonText: string;
  try {
    jsonText = extractJsonFromText(rawResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    await updatePromptRunValidationErrors(promptRunId, [{ path: "root", message }]);
    const template = await getActivePromptTemplate(existing.kind);
    const schemaDesc = template?.output_schema
      ? JSON.stringify(template.output_schema, null, 2)
      : "{}";
    return {
      ok: false as const,
      error: message,
      repair_prompt: buildRepairPrompt(
        [{ path: "root", message }],
        schemaDesc,
        rawResponse,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false as const,
      error: "Parsed text is not valid JSON.",
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const errors = zodErrorsToList(result.error);
    await updatePromptRunValidationErrors(promptRunId, errors, rawResponse);

    const template = await getActivePromptTemplate(existing.kind);
    const schemaDesc = template?.output_schema
      ? JSON.stringify(template.output_schema, null, 2)
      : "{}";

    return {
      ok: false as const,
      error: "Response failed schema validation.",
      validation_errors: errors,
      repair_prompt: buildRepairPrompt(errors, schemaDesc, rawResponse),
    };
  }

  const updated = await completePromptRun(
    promptRunId,
    rawResponse,
    result.data as Record<string, unknown>,
  );

  if (!updated) {
    const completed = await getPromptRunById(promptRunId);
    return {
      ok: true as const,
      already_completed: true,
      parsed: completed?.parsed_response,
    };
  }

  await writeAuditLog("prompt.completed", "prompt_runs", promptRunId);

  if (
    existing.kind === "jd_parse" &&
    existing.target_entity === "applications" &&
    existing.target_entity_id
  ) {
    const jdResult = await applyJdParseResult(
      existing.target_entity_id,
      result.data as Record<string, unknown>,
    );
    revalidatePath("/dashboard");
    revalidatePath("/applications");
    revalidatePath(`/applications/${existing.target_entity_id}`);
    return {
      ok: true as const,
      parsed: result.data,
      status_advance: jdResult.status_advance,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/applications");
  if (existing.target_entity_id) {
    revalidatePath(`/applications/${existing.target_entity_id}`);
  }
  return { ok: true as const, parsed: result.data };
}

export async function abandonPromptRun(promptRunId: string) {
  const existing = await getPromptRunById(promptRunId);
  await abandonPromptRunRow(promptRunId);
  if (existing?.target_entity_id) {
    revalidatePath(`/applications/${existing.target_entity_id}`);
  }
  return { ok: true };
}

export async function getRecentPromptRuns(limit = 10) {
  return await listRecentPromptRuns(limit);
}
