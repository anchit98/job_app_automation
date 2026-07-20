"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { isApplicationStatus } from "@/lib/applications/status";
import {
  getApplicationById,
  getActivePromptTemplate,
  createPromptRun,
  insertApplication,
  listApplications,
  updateApplicationJdParsed,
  updateApplicationStatusRow,
  updatePromptRunText,
} from "@/lib/db/queries";
import type { ApplicationStatus } from "@/lib/db/types";
import {
  planStatusAdvance,
  statusRank,
  type AutoStatusEvent,
  type StatusAdvanceOutcome,
} from "@/lib/applications/auto-status";
import { sanitizeJd, wrapJdForPrompt } from "@/lib/jd/sanitize";
import { scheduleFollowUpsForApplication } from "@/lib/follow-ups/enqueue";
import { truncateJdIfNeeded } from "@/lib/tracker/jd";
import { findSimilarApplications } from "@/lib/tracker/queries";
import {
  composePrompt,
  warnIfPromptTooLong,
} from "@/lib/prompt/composer";

const createApplicationSchema = z.object({
  jd: z.string().min(1, "Job description is required."),
  company: z.string().optional(),
  role: z.string().optional(),
  job_url: z
    .string()
    .optional()
    .refine(
      (value) => !value || value === "" || z.string().url().safeParse(value).success,
      "Job URL must be a valid URL.",
    ),
  notes: z.string().optional(),
  email_instructions: z.string().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export async function createApplication(input: CreateApplicationInput) {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const jdSanitized = sanitizeJd(parsed.data.jd);
  const { text: jdRaw, truncated: jdTruncated } = truncateJdIfNeeded(jdSanitized);
  if (jdRaw.length < 50) {
    return {
      ok: false as const,
      error:
        "Job description must be at least 50 characters after cleaning HTML and extra whitespace.",
    };
  }

  const similar = findSimilarApplications(
    parsed.data.company,
    parsed.data.role,
  );

  const id = insertApplication({
    company: parsed.data.company,
    role: parsed.data.role,
    job_url: parsed.data.job_url || null,
    jd_raw: jdRaw,
    notes: parsed.data.notes,
    email_instructions: parsed.data.email_instructions,
  });

  await writeAuditLog("application.created", "applications", id, {
    company: parsed.data.company ?? null,
    role: parsed.data.role ?? null,
    jd_truncated: jdTruncated,
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return {
    ok: true as const,
    id,
    jd_truncated: jdTruncated,
    similar_applications: similar,
  };
}

export async function getApplication(id: string) {
  return getApplicationById(id);
}

export async function getApplications() {
  return listApplications();
}

export async function confirmStatusAdvance(
  id: string,
  status: ApplicationStatus,
) {
  return updateApplicationStatus(id, status);
}

export async function maybeAdvanceApplicationStatus(
  applicationId: string,
  event: AutoStatusEvent,
  options?: { confirmed?: boolean },
): Promise<StatusAdvanceOutcome> {
  let lastAdvanced: StatusAdvanceOutcome = { outcome: "skipped" };

  // Chain auto steps (e.g. ready → applied → email_sent on gmail drafts).
  for (let i = 0; i < 4; i++) {
    const existing = getApplicationById(applicationId);
    if (!existing) {
      return { outcome: "error", error: "Application not found." };
    }

    const plan = planStatusAdvance(existing.status, event);
    if (!plan) {
      return lastAdvanced;
    }

    if (statusRank(plan.suggested) <= statusRank(existing.status)) {
      return lastAdvanced;
    }

    if (plan.mode === "confirm" && !options?.confirmed) {
      return {
        outcome: "needs_confirmation",
        suggested_status: plan.suggested,
        message: plan.message,
        event,
      };
    }

    const updated = await updateApplicationStatus(applicationId, plan.suggested);
    if (!updated.ok) {
      return { outcome: "error", error: updated.error };
    }

    lastAdvanced = { outcome: "advanced", new_status: plan.suggested };

    if (plan.mode === "confirm") {
      break;
    }
  }

  return lastAdvanced;
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
) {
  if (!isApplicationStatus(status)) {
    return { ok: false as const, error: "Invalid status." };
  }

  const existing = getApplicationById(id);
  if (!existing) {
    return { ok: false as const, error: "Application not found." };
  }

  const updated = updateApplicationStatusRow(id, status);
  if (!updated) {
    return { ok: false as const, error: "Failed to update status." };
  }

  await writeAuditLog("application.status_changed", "applications", id, {
    from: existing.status,
    to: status,
  });

  if (status === "email_sent" && existing.status !== "email_sent") {
    try {
      scheduleFollowUpsForApplication(id);
      await writeAuditLog("follow_ups.scheduled", "applications", id);
    } catch (e) {
      console.error("Follow-up scheduling failed after status change:", e);
    }
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function exportJdParsePrompt(applicationId: string) {
  const application = getApplicationById(applicationId);
  if (!application) {
    throw new Error("Application not found.");
  }

  const template = getActivePromptTemplate("jd_parse");
  if (!template) {
    throw new Error("No active template found for kind: jd_parse");
  }

  const runId = createPromptRun("jd_parse", {
    entity: "applications",
    entityId: applicationId,
  });

  const jdWrapped = wrapJdForPrompt(application.jd_raw);
  const promptText = composePrompt(template, { jd_wrapped: jdWrapped }, runId);
  const lengthWarning = warnIfPromptTooLong(promptText);

  updatePromptRunText(runId, promptText);

  await writeAuditLog("prompt.exported", "prompt_runs", runId, {
    kind: "jd_parse",
    application_id: applicationId,
  });

  revalidatePath(`/applications/${applicationId}`);
  return {
    prompt_run_id: runId,
    prompt_text: promptText,
    length_warning: lengthWarning,
    chatgpt_url: "https://chatgpt.com/",
  };
}

export async function applyJdParseResult(
  applicationId: string,
  parsed: Record<string, unknown>,
) {
  const application = getApplicationById(applicationId);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  const company =
    (typeof parsed.company === "string" && parsed.company.trim()) ||
    application.company ||
    undefined;
  const role =
    (typeof parsed.role === "string" && parsed.role.trim()) ||
    application.role ||
    undefined;

  updateApplicationJdParsed(applicationId, parsed as import("@/lib/db/types").JdParsed, {
    company,
    role,
  });

  await writeAuditLog("application.jd_parsed", "applications", applicationId);

  const status_advance = await maybeAdvanceApplicationStatus(
    applicationId,
    "jd_parsed",
  );

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true as const, status_advance };
}
