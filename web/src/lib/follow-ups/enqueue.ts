import { writeAuditLog } from "@/lib/audit";
import {
  createPromptRun,
  getActivePromptTemplate,
  getApplicationById,
  getContactById,
  getEmailById,
  getProfileRow,
  getPromptRunById,
  listEmails,
  updatePromptRunText,
} from "@/lib/db/queries";
import type { FollowUp } from "@/lib/db/types";
import {
  claimFollowUpForProcessing,
  followUpsExistForEmail,
  getFollowUpByEmailSequence,
  getFollowUpById,
  listDueFollowUps,
  markFollowUpEnqueued,
  releaseFollowUpProcessing,
  scheduleFollowUpsForColdEmail,
} from "@/lib/follow-ups/queries";
import {
  composePrompt,
  warnIfPromptTooLong,
} from "@/lib/prompt/composer";
import { buildJdContent } from "@/lib/resume/context";

export async function scheduleFollowUpsForApplication(
  applicationId: string,
): Promise<number> {
  const profile = await getProfileRow();
  const timezone = profile?.timezone ?? "UTC";
  const emails = (await listEmails(applicationId)).filter(
    (e) => e.kind === "cold" && e.draft_status === "created",
  );

  for (const email of emails) {
    const before = await followUpsExistForEmail(email.id);
    await scheduleFollowUpsForColdEmail(applicationId, email.id, timezone);
    if (!before) {
      void writeAuditLog("follow_ups.scheduled", "applications", applicationId, {
        email_id: email.id,
      });
    }
  }
  return emails.length;
}

export async function composeFollowUpPromptText(followUp: FollowUp): Promise<{
  promptRunId: string;
  promptText: string;
  lengthWarning: string | null;
}> {
  const originalEmail = await getEmailById(followUp.email_id);
  if (!originalEmail) {
    throw new Error("Original cold email not found.");
  }

  const application = await getApplicationById(followUp.application_id);
  if (!application) {
    throw new Error("Application not found.");
  }

  const contact = await getContactById(originalEmail.contact_id);
  if (!contact) {
    throw new Error("Contact not found.");
  }

  const template = await getActivePromptTemplate("follow_up");
  if (!template) {
    throw new Error("No active follow-up prompt template.");
  }

  const profile = await getProfileRow();
  const runId = await createPromptRun("follow_up", {
    entity: "follow_ups",
    entityId: followUp.id,
  });

  const promptText = composePrompt(
    template,
    {
      user_profile_json: JSON.stringify(
        {
          full_name: profile?.full_name ?? "Candidate",
          headline: profile?.headline ?? "",
          location: profile?.location ?? "",
        },
        null,
        2,
      ),
      target_company:
        application.company?.trim() ||
        application.jd_parsed?.company?.trim() ||
        "the company",
      target_role:
        application.role?.trim() ||
        application.jd_parsed?.role?.trim() ||
        "the role",
      jd_content: buildJdContent(application),
      application_notes: application.notes?.trim() || "(none)",
      original_subject: originalEmail.subject,
      original_body_md: originalEmail.body_md,
      contact_json: JSON.stringify(
        {
          name: contact.name,
          role: contact.role,
          email: contact.email,
        },
        null,
        2,
      ),
      follow_up_sequence: String(followUp.sequence),
    },
    runId,
  );

  const lengthWarning = warnIfPromptTooLong(promptText);
  await updatePromptRunText(runId, promptText);

  return { promptRunId: runId, promptText, lengthWarning };
}

export async function enqueueFollowUpPrompt(
  followUpId: string,
  options?: { force?: boolean },
): Promise<
  | {
      ok: true;
      prompt_run_id: string;
      prompt_text: string;
      length_warning: string | null;
    }
  | { ok: false; error: string; needs_confirmation?: boolean }
> {
  const followUp = await getFollowUpById(followUpId);
  if (!followUp) {
    return { ok: false, error: "Follow-up not found." };
  }

  if (followUp.status === "sent" || followUp.status === "skipped") {
    return { ok: false, error: "Follow-up is already completed." };
  }

  if (followUp.prompt_run_id) {
    const existing = await getPromptRunById(followUp.prompt_run_id);
    if (existing?.status === "pending" && existing.prompt_text) {
      return {
        ok: true,
        prompt_run_id: existing.id,
        prompt_text: existing.prompt_text,
        length_warning: warnIfPromptTooLong(existing.prompt_text),
      };
    }
  }

  const application = await getApplicationById(followUp.application_id);
  if (!application) {
    return { ok: false, error: "Application not found." };
  }

  if (
    !options?.force &&
    ["hr_replied", "interview_scheduled", "offer", "accepted"].includes(
      application.status,
    )
  ) {
    return {
      ok: false,
      error:
        "Application already has a response — confirm before enqueuing this follow-up.",
      needs_confirmation: true,
    };
  }

  if (followUp.sequence === 2) {
    const seq1 = await getFollowUpByEmailSequence(followUp.email_id, 1);
    if (seq1 && seq1.status !== "sent" && seq1.status !== "skipped") {
      return {
        ok: false,
        error: "Send or skip follow-up #1 before running follow-up #2.",
      };
    }
  }

  if (followUp.status === "waiting") {
    return { ok: false, error: "Follow-up #2 activates after #1 is sent." };
  }

  const claimed =
    followUp.status === "processing" ||
    (await claimFollowUpForProcessing(followUp.id));

  if (!claimed) {
    return { ok: false, error: "Could not claim follow-up for processing." };
  }

  try {
    const { promptRunId, promptText, lengthWarning } =
      await composeFollowUpPromptText(followUp);
    await markFollowUpEnqueued(followUp.id, promptRunId);

    await writeAuditLog("follow_up.prompt_enqueued", "follow_ups", followUp.id, {
      application_id: followUp.application_id,
      prompt_run_id: promptRunId,
      sequence: followUp.sequence,
    });

    return {
      ok: true,
      prompt_run_id: promptRunId,
      prompt_text: promptText,
      length_warning: lengthWarning,
    };
  } catch (e) {
    await releaseFollowUpProcessing(followUp.id);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to enqueue prompt.",
    };
  }
}

export async function enqueueDueFollowUpPrompts(): Promise<{
  processed: number;
  enqueued: number;
  errors: string[];
}> {
  const due = await listDueFollowUps(25);
  let enqueued = 0;
  const errors: string[] = [];

  for (const followUp of due) {
    const result = await enqueueFollowUpPrompt(followUp.id);
    if (result.ok) {
      enqueued++;
    } else if (!result.needs_confirmation) {
      errors.push(`${followUp.id}: ${result.error}`);
    }
  }

  return { processed: due.length, enqueued, errors };
}
