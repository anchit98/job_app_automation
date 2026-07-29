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
  claimFollowUpForBatch,
  getFollowUpById,
  listFollowUpsForApplication,
  listRunnableFollowUpsForApplication,
  markFollowUpEnqueued,
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
import { applyFollowUpGreeting } from "@/lib/follow-ups/greeting";
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
  revalidatePath("/applications");
  revalidatePath("/prompts");
  revalidatePath("/dashboard");
}

export async function getFollowUpsForApplication(applicationId: string) {
  return await listFollowUpsForApplication(applicationId);
}

export async function runEnqueueDueFollowUps() {
  const result = await enqueueDueFollowUpPrompts();
  revalidatePath("/prompts");
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return result;
}

export async function runFollowUpNow(
  followUpId: string,
  options?: { force?: boolean },
) {
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const siblings = await listRunnableFollowUpsForApplication(
    followUp.application_id,
    followUp.sequence,
  );
  const batchIds = siblings.map((s) => s.id);
  if (!batchIds.includes(followUpId)) {
    batchIds.unshift(followUpId);
  }

  // Claim every contact in the batch so cron cannot enqueue them separately.
  for (const id of batchIds) {
    await claimFollowUpForBatch(id);
  }

  const result = await enqueueFollowUpPrompt(followUpId, options);
  if (!result.ok) {
    return result;
  }

  for (const id of batchIds) {
    await markFollowUpEnqueued(id, result.prompt_run_id);
  }

  revalidateFollowUpPaths(followUp.application_id);
  return {
    ...result,
    follow_up_ids: batchIds,
    contact_count: batchIds.length,
  };
}

/** Poll progress while Jobs-page follow-up stays in place. */
export async function getFollowUpDraftStatus(followUpId: string) {
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const allSameSeq = (
    await listFollowUpsForApplication(followUp.application_id)
  ).filter(
    (f) =>
      f.sequence === followUp.sequence &&
      !["skipped", "waiting"].includes(f.status),
  );

  const active = allSameSeq.filter((f) => f.status !== "sent");
  const targets = active.length > 0 ? active : allSameSeq;
  const withDraft = targets.filter((f) => f.draft_email_id);
  let gmailReady = 0;
  for (const f of withDraft) {
    if (!f.draft_email_id) continue;
    const email = await getEmailById(f.draft_email_id);
    if (email?.gmail_draft_id && email.draft_status === "created") {
      gmailReady += 1;
    }
  }

  let promptStatus: string | null = null;
  if (followUp.prompt_run_id) {
    const run = await getPromptRunById(followUp.prompt_run_id);
    promptStatus = run?.status ?? null;
  }

  const expected = Math.max(targets.length, 1);

  return {
    ok: true as const,
    status: followUp.status,
    draft_email_id: followUp.draft_email_id,
    prompt_run_id: followUp.prompt_run_id,
    prompt_status: promptStatus,
    contact_count: expected,
    drafts_ready: withDraft.length,
    gmail_ready: gmailReady,
    all_drafts_ready: withDraft.length >= expected && withDraft.length > 0,
    all_gmail_ready: gmailReady >= expected && gmailReady > 0,
  };
}

export async function snoozeFollowUp(followUpId: string, businessDays: number) {
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const profile = await getProfileRow();
  const timezone = profile?.timezone ?? "UTC";
  const until = toUtcIso(addBusinessDays(new Date(), businessDays, timezone));

  const ok = await updateFollowUpStatus(followUpId, "snoozed", {
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
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  await updateFollowUpStatus(followUpId, "skipped");
  await writeAuditLog("follow_up.skipped", "follow_ups", followUpId);

  if (followUp.sequence === 1) {
    const profile = await getProfileRow();
    await activateSecondFollowUp(followUp.email_id, profile?.timezone ?? "UTC");
  }

  revalidateFollowUpPaths(followUp.application_id);
  return { ok: true as const };
}

async function createFollowUpDraftEmail(input: {
  followUpId: string;
  applicationId: string;
  contactId: string;
  contactName: string | null;
  contactRole: string | null;
  subject: string;
  bodyTemplate: string;
  promptRunId: string;
}): Promise<string> {
  const bodyMd = applyFollowUpGreeting(input.bodyTemplate, input.contactName);

  const draftEmailId = await insertEmail({
    application_id: input.applicationId,
    contact_id: input.contactId,
    kind: "follow_up",
    subject: input.subject,
    body_md: bodyMd,
    body_html: markdownToEmailHtml(bodyMd),
    role_template: input.contactRole
      ? inferRoleTemplate(input.contactRole)
      : null,
    prompt_run_id: input.promptRunId,
    draft_status: "pending",
  });

  await updateFollowUpStatus(input.followUpId, "enqueued", {
    draft_email_id: draftEmailId,
  });

  await writeAuditLog("follow_up.generated", "follow_ups", input.followUpId, {
    application_id: input.applicationId,
    draft_email_id: draftEmailId,
  });

  return draftEmailId;
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

  const run = await getPromptRunById(promptRunId);
  if (!run || run.kind !== "follow_up") {
    return { ok: false as const, error: "Not a follow-up prompt run." };
  }

  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  let jsonText: string;
  try {
    jsonText = extractJsonFromText(rawResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON";
    await updatePromptRunValidationErrors(
      promptRunId,
      [{ path: "root", message }],
      rawResponse,
    );
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
    await updatePromptRunValidationErrors(promptRunId, issues, rawResponse);
    return {
      ok: false as const,
      error: "Follow-up failed schema validation.",
      validation_errors: issues,
      repair_prompt: buildFollowUpRepairPrompt(issues, rawResponse),
    };
  }

  const contentCheck = validateFollowUpContent(schemaResult.data);
  if (!contentCheck.ok) {
    await updatePromptRunValidationErrors(
      promptRunId,
      contentCheck.issues,
      rawResponse,
    );
    return {
      ok: false as const,
      error: "Follow-up content validation failed.",
      validation_errors: contentCheck.issues,
      repair_prompt: buildFollowUpRepairPrompt(contentCheck.issues, rawResponse),
    };
  }

  const profile = await getProfileRow();
  const bodyTemplate = stripEmailSignature(
    schemaResult.data.body_md,
    profile?.full_name,
  );
  const subject = schemaResult.data.subject;

  const batch = await listRunnableFollowUpsForApplication(
    followUp.application_id,
    followUp.sequence,
  );
  const targets = batch.length > 0 ? batch : [followUp];
  const linked = targets.filter(
    (f) =>
      !f.prompt_run_id ||
      f.prompt_run_id === promptRunId ||
      f.id === followUpId,
  );
  const toDraft = (linked.length > 0 ? linked : targets).filter(
    (f) => !f.draft_email_id,
  );

  if (toDraft.length === 0 && followUp.draft_email_id) {
    return {
      ok: true as const,
      draft_email_id: followUp.draft_email_id,
      follow_up_id: followUpId,
      draft_count: 1,
    };
  }

  const draftIds: string[] = [];
  for (const target of toDraft) {
    const originalEmail = await getEmailById(target.email_id);
    if (!originalEmail) continue;
    const contact = await getContactById(originalEmail.contact_id);
    if (!contact?.email?.trim()) continue;

    const draftEmailId = await createFollowUpDraftEmail({
      followUpId: target.id,
      applicationId: target.application_id,
      contactId: contact.id,
      contactName: contact.name,
      contactRole: contact.role,
      subject,
      bodyTemplate,
      promptRunId,
    });
    draftIds.push(draftEmailId);
  }

  if (draftIds.length === 0) {
    return { ok: false as const, error: "No contacts available to draft." };
  }

  const completed = await completePromptRun(
    promptRunId,
    rawResponse,
    schemaResult.data,
  );
  if (!completed) {
    return { ok: false as const, error: "Prompt run was already completed." };
  }

  revalidateFollowUpPaths(followUp.application_id);
  return {
    ok: true as const,
    draft_email_id: draftIds[0],
    follow_up_id: followUpId,
    draft_count: draftIds.length,
  };
}

export async function manualSendFollowUp(followUpId: string) {
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false as const, error: "Follow-up not found." };
  }

  const related = (
    await listFollowUpsForApplication(followUp.application_id)
  ).filter(
    (f) =>
      f.sequence === followUp.sequence &&
      f.draft_email_id &&
      f.status !== "sent" &&
      f.status !== "skipped",
  );

  const targets =
    related.length > 0
      ? related
      : followUp.draft_email_id
        ? [followUp]
        : [];
  if (targets.length === 0) {
    return {
      ok: false as const,
      error: "Generate the follow-up email first (run the prompt).",
    };
  }

  const draftEmailIds = targets
    .map((f) => f.draft_email_id)
    .filter((id): id is string => Boolean(id));

  const draftResult = await createGmailDrafts(draftEmailIds);
  if (!draftResult.ok) {
    return { ok: false as const, error: draftResult.error };
  }
  const failed = draftResult.results?.find((r) => !r.ok);
  if (failed) {
    return {
      ok: false as const,
      error: failed.error ?? "Failed to create Gmail draft.",
    };
  }

  const profile = await getProfileRow();
  const timezone = profile?.timezone ?? "UTC";
  const sentAt = new Date().toISOString();
  let firstGmailUrl: string | null = null;

  for (const target of targets) {
    if (!target.draft_email_id) continue;
    const refreshed = await getEmailById(target.draft_email_id);
    await updateFollowUpStatus(target.id, "sent", { sent_at: sentAt });
    if (target.sequence === 1) {
      await activateSecondFollowUp(target.email_id, timezone);
    }
    await writeAuditLog("follow_up.sent", "follow_ups", target.id, {
      draft_email_id: target.draft_email_id,
    });
    if (!firstGmailUrl && refreshed?.gmail_draft_id) {
      firstGmailUrl = gmailDraftWebUrl(refreshed.gmail_draft_id);
    }
  }

  revalidateFollowUpPaths(followUp.application_id);

  return {
    ok: true as const,
    gmail_url: firstGmailUrl,
    draft_count: targets.length,
  };
}

export async function ensureFollowUpsScheduled(applicationId: string) {
  const count = await scheduleFollowUpsForApplication(applicationId);
  revalidateFollowUpPaths(applicationId);
  return { ok: true as const, scheduled: count };
}
