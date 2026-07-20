"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { resolveCompanyDomain } from "@/lib/contacts/domain-resolver";
import {
  generateEmailPatterns,
  parseNameParts,
} from "@/lib/contacts/pattern-generator";
import {
  getSmtpCapability,
  verifyEmailPatterns,
} from "@/lib/contacts/smtp-verify";
import {
  contactIntakeSchema,
  mailmeteorResultSchema,
  manualContactSchema,
  mapMailmeteorVerificationStatus,
  type ContactIntake,
  type MailmeteorResult,
} from "@/lib/contacts/validate";
import {
  completePromptRun,
  createPromptRun,
  deleteContact,
  getApplicationById,
  getContactById,
  getPromptRunById,
  insertContact,
  listContacts,
  updatePromptRunText,
  updatePromptRunValidationErrors,
} from "@/lib/db/queries";
import type { Contact, EmailDiscoveryPayload } from "@/lib/db/types";
import { zodErrorsToList } from "@/lib/prompt/repair";

const MAILMETEOR_URL = "https://mailmeteor.com/tools/linkedin-email-finder";

function revalidateApplication(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/api/applications/${applicationId}/contacts`);
}

function parseDiscoveryPayload(promptText: string): EmailDiscoveryPayload | null {
  try {
    const parsed = JSON.parse(promptText) as EmailDiscoveryPayload;
    if (!parsed?.linkedin_url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getContactsForApplication(
  applicationId: string,
): Promise<Contact[]> {
  return await listContacts(applicationId);
}

export async function lookupCompanyDomain(companyName: string) {
  const result = await resolveCompanyDomain(companyName);
  return {
    ok: true as const,
    domain: result.domain,
    suggestions: result.suggestions,
  };
}

export async function getSmtpVerifyStatus() {
  return { capability: getSmtpCapability() };
}

export async function startEmailDiscovery(
  applicationId: string,
  intake: ContactIntake,
) {
  const application = await getApplicationById(applicationId);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  const parsed = contactIntakeSchema.safeParse(intake);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid contact details.",
      validation_errors: zodErrorsToList(parsed.error),
    };
  }

  let companyDomain = parsed.data.company_domain ?? null;
  if (!companyDomain && application.company) {
    const resolved = await resolveCompanyDomain(application.company);
    companyDomain = resolved.domain;
  }

  const payload: EmailDiscoveryPayload = {
    linkedin_url: parsed.data.linkedin_url,
    name: parsed.data.name ?? null,
    role: parsed.data.role ?? null,
    company_domain: companyDomain,
  };

  const promptRunId = await createPromptRun("email_discovery", {
    entity: "application",
    entityId: applicationId,
  });

  const marker = `\n<!-- prompt_run_id: ${promptRunId} -->`;
  const promptText = JSON.stringify(payload, null, 2) + marker;
  await updatePromptRunText(promptRunId, promptText);

  await writeAuditLog("email_discovery_started", "application", applicationId, {
    prompt_run_id: promptRunId,
    linkedin_url: payload.linkedin_url,
  });

  return {
    ok: true as const,
    prompt_run_id: promptRunId,
    clipboard_text: payload.linkedin_url,
    mailmeteor_url: MAILMETEOR_URL,
    payload,
  };
}

export async function submitMailmeteorResult(
  promptRunId: string,
  result: MailmeteorResult,
) {
  const run = await getPromptRunById(promptRunId);
  if (!run) {
    return { ok: false as const, error: "Discovery run not found." };
  }
  if (run.kind !== "email_discovery") {
    return { ok: false as const, error: "Invalid discovery run." };
  }
  if (run.status !== "pending") {
    const existing = (await listContacts(run.target_entity_id ?? "")).find(
      (contact) => contact.prompt_run_id === promptRunId,
    );
    if (existing) {
      return { ok: true as const, contact: existing, already_submitted: true };
    }
    return { ok: false as const, error: "This discovery run is no longer pending." };
  }

  const applicationId = run.target_entity_id;
  if (!applicationId) {
    return { ok: false as const, error: "Application not linked to discovery run." };
  }

  const parsed = mailmeteorResultSchema.safeParse(result);
  if (!parsed.success) {
    await updatePromptRunValidationErrors(
      promptRunId,
      zodErrorsToList(parsed.error),
      JSON.stringify(result),
    );
    return {
      ok: false as const,
      error: "Mailmeteor result failed validation.",
      validation_errors: zodErrorsToList(parsed.error),
    };
  }

  const payload = parseDiscoveryPayload(run.prompt_text);
  const verificationStatus = mapMailmeteorVerificationStatus(
    parsed.data.validation_status,
  );

  const contactId = await insertContact({
    application_id: applicationId,
    name: parsed.data.name,
    role: parsed.data.position ?? payload?.role ?? null,
    linkedin_url: payload?.linkedin_url ?? null,
    company_domain: payload?.company_domain ?? null,
    email: parsed.data.email,
    email_source: "mailmeteor_manual",
    verification_status: verificationStatus,
    notes: parsed.data.notes ?? null,
    prompt_run_id: promptRunId,
  });

  const stored = {
    ...parsed.data,
    contact_id: contactId,
    verification_status: verificationStatus,
  };

  const completed = await completePromptRun(
    promptRunId,
    JSON.stringify(parsed.data),
    stored,
  );
  if (!completed) {
    return { ok: false as const, error: "Discovery run was already completed." };
  }

  await writeAuditLog("contact_created", "contact", contactId, {
    application_id: applicationId,
    email_source: "mailmeteor_manual",
    verification_status: verificationStatus,
  });

  revalidateApplication(applicationId);
  return {
    ok: true as const,
    contact_id: contactId,
    verification_status: verificationStatus,
  };
}

export async function markNoEmailAvailable(promptRunId: string) {
  const run = await getPromptRunById(promptRunId);
  if (!run || run.kind !== "email_discovery" || !run.target_entity_id) {
    return { ok: false as const, error: "Discovery run not found." };
  }

  const payload = parseDiscoveryPayload(run.prompt_text);
  const name = payload?.name?.trim() || "Unknown contact";

  const contactId = await insertContact({
    application_id: run.target_entity_id,
    name,
    role: payload?.role ?? null,
    linkedin_url: payload?.linkedin_url ?? null,
    company_domain: payload?.company_domain ?? null,
    email: null,
    email_source: null,
    verification_status: "no_email_available",
    notes: "No email found via Mailmeteor.",
    prompt_run_id: promptRunId,
  });

  await completePromptRun(
    promptRunId,
    JSON.stringify({ status: "no_email_available" }),
    { contact_id: contactId, status: "no_email_available" },
  );

  await writeAuditLog("contact_no_email", "contact", contactId, {
    application_id: run.target_entity_id,
  });

  revalidateApplication(run.target_entity_id);
  return { ok: true as const, contact_id: contactId };
}

export async function runPatternFallback(input: {
  applicationId: string;
  promptRunId?: string | null;
  name: string;
  companyDomain: string;
  linkedinUrl?: string | null;
  role?: string | null;
}) {
  const application = await getApplicationById(input.applicationId);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  const domain = input.companyDomain.trim().toLowerCase();
  if (!domain || !domain.includes(".")) {
    return { ok: false as const, error: "Enter a valid company domain." };
  }

  const nameParts = parseNameParts(input.name);
  if (!nameParts) {
    return {
      ok: false as const,
      error: "Enter a full name (first and last) for pattern guessing.",
    };
  }

  const patterns = generateEmailPatterns(nameParts, domain);
  const verification = await verifyEmailPatterns(patterns, domain);

  const bestEmail =
    verification.best?.result === "accepted"
      ? verification.best.email
      : patterns[0];

  const notes: string[] = [];
  if (verification.catchAll) {
    notes.push(
      "Domain appears to use catch-all SMTP — pattern marked unverified.",
    );
  } else if (!verification.smtpAvailable) {
    notes.push(
      "SMTP verify unavailable on this host — pattern marked unverified.",
    );
  } else if (verification.best?.result !== "accepted") {
    notes.push("No SMTP acceptance — best-guess pattern saved as unverified.");
  }

  const verificationStatus =
    verification.best?.result === "accepted" && !verification.catchAll
      ? "unverified"
      : "unverified";

  const contactId = await insertContact({
    application_id: input.applicationId,
    name: input.name.trim(),
    role: input.role ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    company_domain: domain,
    email: bestEmail,
    email_confidence: verification.best?.result === "accepted" ? 0.5 : null,
    email_source: "pattern_smtp",
    verification_status: verificationStatus,
    notes: notes.join(" "),
    prompt_run_id: input.promptRunId ?? null,
  });

  if (input.promptRunId) {
    const run = await getPromptRunById(input.promptRunId);
    if (run?.status === "pending") {
      await completePromptRun(
        input.promptRunId,
        JSON.stringify({ email: bestEmail, patterns }),
        { contact_id: contactId, email: bestEmail },
      );
    }
  }

  await writeAuditLog("contact_pattern_fallback", "contact", contactId, {
    application_id: input.applicationId,
    domain,
    smtp_available: verification.smtpAvailable,
    catch_all: verification.catchAll,
  });

  revalidateApplication(input.applicationId);
  return {
    ok: true as const,
    contact_id: contactId,
    email: bestEmail,
    verification_status: verificationStatus,
    smtp_available: verification.smtpAvailable,
    catch_all: verification.catchAll,
    note: notes.join(" ") || null,
  };
}

export async function saveManualContact(
  applicationId: string,
  input: {
    name: string;
    role?: string | null;
    linkedin_url?: string | null;
    company_domain?: string | null;
    email: string;
    notes?: string | null;
    promptRunId?: string | null;
  },
) {
  const application = await getApplicationById(applicationId);
  if (!application) {
    return { ok: false as const, error: "Application not found." };
  }

  const parsed = manualContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid contact details.",
      validation_errors: zodErrorsToList(parsed.error),
    };
  }

  const contactId = await insertContact({
    application_id: applicationId,
    name: parsed.data.name,
    role: parsed.data.role ?? null,
    linkedin_url: parsed.data.linkedin_url ?? null,
    company_domain: parsed.data.company_domain ?? null,
    email: parsed.data.email,
    email_source: "manual_entry",
    verification_status: "unverified",
    notes: parsed.data.notes ?? null,
    prompt_run_id: input.promptRunId ?? null,
  });

  if (input.promptRunId) {
    const run = await getPromptRunById(input.promptRunId);
    if (run?.status === "pending") {
      await completePromptRun(
        input.promptRunId,
        JSON.stringify(parsed.data),
        { contact_id: contactId, email: parsed.data.email },
      );
    }
  }

  await writeAuditLog("contact_manual_entry", "contact", contactId, {
    application_id: applicationId,
  });

  revalidateApplication(applicationId);
  return { ok: true as const, contact_id: contactId };
}

export async function removeContact(contactId: string) {
  const contact = await getContactById(contactId);
  if (!contact) {
    return { ok: false as const, error: "Contact not found." };
  }

  await deleteContact(contactId);
  await writeAuditLog("contact_deleted", "contact", contactId, {
    application_id: contact.application_id,
  });
  revalidateApplication(contact.application_id);
  return { ok: true as const };
}
