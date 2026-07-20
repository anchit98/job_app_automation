"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  completePromptRun,
  getContactById,
  getEmailById,
  getProfileRow,
  getPromptRunById,
  insertEmail,
  updatePromptRunValidationErrors,
} from "@/lib/db/queries";
import {
  activateSecondFollowUp,
  getFollowUpById,
  listFollowUpsForApplication,
  updateFollowUpStatus,
} from "@/lib/follow-ups/queries";
import {
  enqueueDueFollowUpPrompts,
  enqueueFollowUpPrompt,
  scheduleFollowUpsForApplication,
} from "@/lib/follow-ups/enqueue";
import {
  addBusinessDays,
  toUtcIso,
} from "@/lib/follow-ups/business-days";
import {
  buildFollowUpRepairPrompt,
  followUpEmailSchema,
  validateFollowUpContent,
} from "@/lib/follow-ups/validate";
import {
  inferRoleTemplate,
  markdownToEmailHtml,
} from "@/lib/emails/validate";
import { stripEmailSignature } from "@/lib/emails/strip-signature";
import {
  extractJsonFromText,
  parsePromptRunMarker,
} from "@/lib/prompt/json-extract";
import { zodErrorsToList } from "@/lib/prompt/repair";
import { createGmailDrafts } from "@/app/actions/emails";
import { gmailDraftWebUrl } from "@/lib/emails/gmail-url";

function revalidateFollowUpPaths(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/prompts");
  revalidatePath("/dashboard");
}

export async function getFollowUpsForApplication(applicationId: string) {
  return listFollowUpsForApplication(applicationId);
}

export async function runEnqueueDueFollowUps() {
  const result = await enqueueDueFollowUpPrompts();
  revalidatePath("/prompts");
  revalidatePath("/dashboard");
  return result;
}

export async function runFollowUpNow(
  followUpId: string,
  options?: { force?: boolean },
) {
  const followUp = getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const result = await enqueueFollowUpPrompt(followUpId, options);
  if (!result.ok) return result;

  revalidateFollowUpPaths(followUp.application_id);
  return result;
}

export async function snoozeFollowUp(followUpId: string, businessDays: number) {
  const followUp = getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const profile = getProfileRow();
  const timezone = profile?.timezone ?? "UTC";
  const until = toUtcIso(addBusinessDays(new Date(), businessDays, timezone));

  const ok = updateFollowUpStatus(followUpId, "snoozed", {
    snoozed_until: until,
    due_at: until,
  });
  if (!ok) {
    return { ok: false as const, error: "Could not snooze follow-up." };
  }

  await writeAuditLog("follow_up.snoozed", "follow_ups", followUpId, {
    business_days: businessDays,
    until,
  });

  revalidateFollowUpPaths(followUp.application_id);
  return { ok: true as const, until };
}

export async function skipFollowUp(followUpId: string) {
  const followUp = getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  updateFollowUpStatus(followUpId, "skipped");
  await writeAuditLog("follow_up.skipped", "follow_ups", followUpId);

  if (followUp.sequence === 1) {
    const profile = getProfileRow();
    activateSecondFollowUp(followUp.email_id, profile?.timezone ?? "UTC");
  }

  revalidateFollowUpPaths(followUp.application_id);
  return { ok: true as const };
}

export async function submitFollowUpResponse(
  promptRunId: string,
  rawResponse: string,
  followUpId: string,
) {
  if (!rawResponse.trim()) {
    return { ok: false as const, error: "Response is empty." };
  }

  const markerId = parsePromptRunMarker(rawResponse);
  if (markerId && markerId !== promptRunId) {
    return {
      ok: false as const,
      error: "This response belongs to a different prompt run.",
    };
  }

  const run = getPromptRunById(promptRunId);
  if (!run || run.kind !== "follow_up") {
    return { ok: false as const, error: "Not a follow-up prompt run." };
  }

  const followUp = getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  let jsonText: string;
  try {
    jsonText = extractJsonFromText(rawResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    updatePromptRunValidationErrors(promptRunId, [{ path: "root", message }], rawResponse);
    return { ok: false as const, error: message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false as const, error: "Parsed text is not valid JSON." };
  }

  const schemaResult = followUpEmailSchema.safeParse(parsed);
  if (!schemaResult.success) {
    const issues = zodErrorsToList(schemaResult.error);
    updatePromptRunValidationErrors(promptRunId, issues, rawResponse);
    return {
      ok: false as const,
      error: "Follow-up failed schema validation.",
      validation_errors: issues,
      repair_prompt: buildFollowUpRepairPrompt(issues, rawResponse),
    };
  }

  const contentCheck = validateFollowUpContent(schemaResult.data);
  if (!contentCheck.ok) {
    updatePromptRunValidationErrors(promptRunId, contentCheck.issues, rawResponse);
    return {
      ok: false as const,
      error: "Follow-up content validation failed.",
      validation_errors: contentCheck.issues,
      repair_prompt: buildFollowUpRepairPrompt(contentCheck.issues, rawResponse),
    };
  }

  const originalEmail = getEmailById(followUp.email_id);
  if (!originalEmail) {
    return { ok: false as const, error: "Original email not found." };
  }

  const contact = getContactById(originalEmail.contact_id);
  const profile = getProfileRow();
  const bodyMd = stripEmailSignature(
    schemaResult.data.body_md,
    profile?.full_name,
  );

  const draftEmailId = insertEmail({
    application_id: followUp.application_id,
    contact_id: originalEmail.contact_id,
    kind: "follow_up",
    subject: schemaResult.data.subject,
    body_md: bodyMd,
    body_html: markdownToEmailHtml(bodyMd),
    role_template: contact ? inferRoleTemplate(contact.role) : null,
    prompt_run_id: promptRunId,
    draft_status: "pending",
  });

  const completed = completePromptRun(promptRunId, rawResponse, schemaResult.data);
  if (!completed) {
    return { ok: false as const, error: "Prompt run was already completed." };
  }

  updateFollowUpStatus(followUpId, "enqueued", {
    draft_email_id: draftEmailId,
  });

  await writeAuditLog("follow_up.generated", "follow_ups", followUpId, {
    application_id: followUp.application_id,
    draft_email_id: draftEmailId,
  });

  revalidateFollowUpPaths(followUp.application_id);
  return {
    ok: true as const,
    draft_email_id: draftEmailId,
    follow_up_id: followUpId,
  };
}

export async function manualSendFollowUp(followUpId: string) {
  const followUp = getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const draftEmailId = followUp.draft_email_id;
  if (!draftEmailId) {
    return {
      ok: false as const,
      error: "Generate the follow-up email first (run the prompt).",
    };
  }

  const email = getEmailById(draftEmailId);
  if (!email) {
    return { ok: false as const, error: "Follow-up email record missing." };
  }

  if (email.draft_status !== "created" || !email.gmail_draft_id) {
    const draftResult = await createGmailDrafts([draftEmailId]);
    if (!draftResult.ok) {
      return { ok: false as const, error: draftResult.error };
    }
    const row = draftResult.results?.find((r) => r.email_id === draftEmailId);
    if (row && !row.ok) {
      return {
        ok: false as const,
        error: row.error ?? "Failed to create Gmail draft.",
      };
    }
  }

  const refreshed = getEmailById(draftEmailId);
  const sentAt = new Date().toISOString();
  updateFollowUpStatus(followUpId, "sent", { sent_at: sentAt });

  if (followUp.sequence === 1) {
    const profile = getProfileRow();
    activateSecondFollowUp(followUp.email_id, profile?.timezone ?? "UTC");
  }

  await writeAuditLog("follow_up.sent", "follow_ups", followUpId, {
    draft_email_id: draftEmailId,
  });

  revalidateFollowUpPaths(followUp.application_id);

  const gmailUrl = refreshed?.gmail_draft_id
    ? gmailDraftWebUrl(refreshed.gmail_draft_id)
    : null;

  return { ok: true as const, gmail_url: gmailUrl };
}

export async function ensureFollowUpsScheduled(applicationId: string) {
  const count = scheduleFollowUpsForApplication(applicationId);
  revalidateFollowUpPaths(applicationId);
  return { ok: true as const, scheduled: count };
}
