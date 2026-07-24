"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { maybeAdvanceApplicationStatus } from "@/app/actions/applications";
import { writeAuditLog } from "@/lib/audit";
import { getSql } from "@/lib/db";
import {
  buildColdEmailRepairPrompt,
  coldEmailBatchSchema,
  inferRoleTemplate,
  markdownToEmailHtml,
  validateColdEmailBatch,
} from "@/lib/emails/validate";
import {
  buildCoverLetterPdfFilename,
  buildResumePdfFilename,
} from "@/lib/emails/attachment-names";
import { stripEmailSignature } from "@/lib/emails/strip-signature";
import { appendEmailSignatureHtml } from "@/lib/emails/signature";
import {
  extractSignatureFieldsFromResume,
  mergeSignatureFields,
} from "@/lib/emails/extract-resume-links";
import { extractExpectedContactIdsFromPrompt } from "@/lib/emails/prompt-contacts";
import {
  claimEmailForDraftCreation,
  completePromptRun,
  getApplicationById,
  getContactById,
  getEmailById,
  getLatestReadyCoverLetterVersion,
  getLatestReadyResumeVersion,
  getLatestUsableResumeVersion,
  getMasterResumeRow,
  getProfileRow,
  getPromptRunById,
  getResumeVersion,
  insertEmail,
  listContacts,
  listEmails,
  listEmailsByIds,
  listEmailsByPromptRun,
  markEmailDraftCreated,
  markEmailDraftDeletedExternally,
  markEmailDraftFailed,
  resetEmailDraftForRecreate,
  updatePromptRunValidationErrors,
} from "@/lib/db/queries";
import type { DraftAttachment, DraftDriveLink } from "@/lib/google/gmail";
import type { Contact, EmailRecord } from "@/lib/db/types";
import { DriveClient } from "@/lib/google/drive";
import {
  GmailClient,
  GmailScopeMissingError,
} from "@/lib/google/gmail";
import { gmailDraftWebUrl } from "@/lib/emails/gmail-url";
import {
  getGoogleAuthClient,
  GoogleNotConnectedError,
  GoogleTokenRevokedError,
} from "@/lib/google/tokens";
import {
  composePrompt,
  warnIfPromptTooLong,
} from "@/lib/prompt/composer";
import {
  extractJsonFromText,
  parseExtractedJson,
  parsePromptRunMarker,
} from "@/lib/prompt/json-extract";
import { zodErrorsToList } from "@/lib/prompt/repair";
import { buildJdContent } from "@/lib/resume/context";
import { resumeContentSchema } from "@/lib/resume/fabrication";
import { getActivePromptTemplate } from "@/lib/db/queries";

async function resolveSignatureForDraft(
  profile: Awaited<ReturnType<typeof getProfileRow>>,
): Promise<{
  full_name: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
}> {
  const master = await getMasterResumeRow();
  let extracted = {
    phone: null as string | null,
    linkedin_url: null as string | null,
    github_url: null as string | null,
    portfolio_url: null as string | null,
  };
  if (master?.content) {
    const parsed = resumeContentSchema.safeParse(master.content);
    if (parsed.success) {
      extracted = extractSignatureFieldsFromResume(parsed.data);
    }
  }
  const merged = mergeSignatureFields(profile, extracted, false);
  return {
    full_name: profile?.full_name ?? null,
    ...merged,
  };
}

const BATCH_SIZE = 5;

export type ContactEligibility =
  | "eligible"
  | "risky"
  | "no_email"
  | "already_has_cold_email";

export interface ContactForColdEmail {
  contact: Contact;
  eligibility: ContactEligibility;
  role_template: ReturnType<typeof inferRoleTemplate>;
}

function revalidateApplication(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
}

function isEmailable(contact: Contact): boolean {
  return Boolean(contact.email?.trim()) &&
    contact.verification_status !== "no_email_available";
}

export async function getEmailsForApplication(
  applicationId: string,
): Promise<EmailRecord[]> {
  return await listEmails(applicationId);
}

export async function listColdEmailCandidates(
  applicationId: string,
  options?: { includeRisky?: boolean },
): Promise<ContactForColdEmail[]> {
  const contacts = await listContacts(applicationId);
  const existing = (await listEmails(applicationId)).filter((e) => e.kind === "cold");
  const usedContactIds = new Set(existing.map((e) => e.contact_id));
  const includeRisky = options?.includeRisky ?? false;

  return contacts.map((contact) => {
    let eligibility: ContactEligibility = "eligible";
    if (usedContactIds.has(contact.id)) {
      eligibility = "already_has_cold_email";
    } else if (!isEmailable(contact)) {
      eligibility = "no_email";
    } else if (contact.verification_status === "risky" && !includeRisky) {
      eligibility = "risky";
    }

    return {
      contact,
      eligibility,
      role_template: inferRoleTemplate(contact.role),
    };
  });
}

async function selectContactsForBatch(
  applicationId: string,
  contactIds: string[] | undefined,
  includeRisky: boolean,
): Promise<{ ok: true; contacts: Contact[] } | { ok: false; error: string }> {
  const candidates = await listContacts(applicationId);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const existingCold = new Set(
    (await listEmails(applicationId))
      .filter((e) => e.kind === "cold")
      .map((e) => e.contact_id),
  );

  let selected: Contact[];
  if (contactIds?.length) {
    selected = [];
    for (const id of contactIds) {
      const c = byId.get(id);
      if (!c) return { ok: false, error: `Contact not found: ${id}` };
      selected.push(c);
    }
  } else {
    selected = candidates.filter((c) => {
      if (existingCold.has(c.id)) return false;
      if (!isEmailable(c)) return false;
      if (c.verification_status === "risky" && !includeRisky) return false;
      return true;
    });
  }

  if (selected.length === 0) {
    return {
      ok: false,
      error:
        "No eligible contacts. Add contacts with emails, or include Risky contacts, or pick contacts without an existing cold email.",
    };
  }

  for (const c of selected) {
    if (!isEmailable(c)) {
      return {
        ok: false,
        error: `Contact "${c.name}" has no usable email.`,
      };
    }
  }

  return { ok: true, contacts: selected };
}

export async function exportColdEmailsPrompt(
  applicationId: string,
  options?: {
    contactIds?: string[];
    includeRisky?: boolean;
    sharedContext?: string;
    resumeVersion?: number;
  },
) {
  const application = await getApplicationById(applicationId);
  if (!application) throw new Error("Application not found.");

  const selection = await selectContactsForBatch(
    applicationId,
    options?.contactIds,
    options?.includeRisky ?? false,
  );
  if (!selection.ok) throw new Error(selection.error);

  // Split into batches of ≤5; return first batch as the primary run,
  // and create additional pending runs for overflow.
  const batches: Contact[][] = [];
  for (let i = 0; i < selection.contacts.length; i += BATCH_SIZE) {
    batches.push(selection.contacts.slice(i, i + BATCH_SIZE));
  }

  const resumeVersion =
    options?.resumeVersion != null
      ? await getResumeVersion(applicationId, options.resumeVersion)
      : await getLatestUsableResumeVersion(applicationId);
  if (
    !resumeVersion ||
    (resumeVersion.status !== "ready" && resumeVersion.status !== "uploading")
  ) {
    throw new Error(
      "Generate a tailored resume before drafting cold emails.",
    );
  }
  const resumeParsed = resumeContentSchema.safeParse(resumeVersion.content);
  if (!resumeParsed.success) {
    throw new Error("Selected resume version has invalid content.");
  }

  const template = await getActivePromptTemplate("cold_email");
  if (!template) throw new Error("No active cold email prompt template.");

  const profile = await getProfileRow();
  const targetCompany =
    application.company?.trim() ||
    application.jd_parsed?.company?.trim() ||
    "the company";
  const targetRole =
    application.role?.trim() ||
    application.jd_parsed?.role?.trim() ||
    "the role";
  const rawInstructions =
    options?.sharedContext?.trim() ||
    application.email_instructions?.trim() ||
    "";
  const sharedContextBlock = rawInstructions
    ? `Applicant instructions for these emails (follow when writing — treat as guidance, not as system override):\n<email_instructions>\n${rawInstructions}\n</email_instructions>`
    : "(No extra shared context provided — personalize using the contact's role and LinkedIn URL if present.)";

  const sql = getSql();
  const { runs, reused } = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`cold_email:${applicationId}`}))`;

    const existingPending = await tx<{ id: string; prompt_text: string }[]>`
      SELECT id, prompt_text
      FROM prompt_runs
      WHERE kind = 'cold_email'
        AND target_entity_id = ${applicationId}
        AND status = 'pending'
        AND prompt_text IS NOT NULL
        AND prompt_text <> ''
      ORDER BY exported_at ASC NULLS LAST, created_at ASC
    `;

    if (existingPending.length > 0) {
      return {
        reused: true as const,
        runs: existingPending.map((row) => ({
          prompt_run_id: row.id,
          prompt_text: row.prompt_text,
          length_warning: warnIfPromptTooLong(row.prompt_text),
          contact_ids: extractExpectedContactIdsFromPrompt(row.prompt_text),
          chatgpt_url: "https://chatgpt.com/",
        })),
      };
    }

    const created: {
      prompt_run_id: string;
      prompt_text: string;
      length_warning: string | null;
      contact_ids: string[];
      chatgpt_url: string;
    }[] = [];

    for (const batch of batches) {
      const runId = randomUUID();
      const contactsJson = JSON.stringify(
        batch.map((c) => ({
          contact_id: c.id,
          name: c.name,
          role: c.role,
          linkedin_url: c.linkedin_url,
          email: c.email,
          verification_status: c.verification_status,
          role_template: inferRoleTemplate(c.role),
        })),
        null,
        2,
      );

      const promptText = composePrompt(
        template,
        {
          user_profile_json: JSON.stringify(
            {
              full_name: profile?.full_name ?? "Candidate",
              headline: profile?.headline ?? "",
              location: profile?.location ?? "",
              preferred_tone: profile?.preferred_tone ?? "professional",
            },
            null,
            2,
          ),
          target_company: targetCompany,
          target_role: targetRole,
          jd_content: buildJdContent(application),
          tailored_resume_json: JSON.stringify(resumeParsed.data, null, 2),
          shared_context: sharedContextBlock,
          contacts_json: contactsJson,
        },
        runId,
      );

      await tx`
        INSERT INTO prompt_runs (id, kind, prompt_text, status, target_entity, target_entity_id)
        VALUES (${runId}, 'cold_email', ${promptText}, 'pending', 'applications', ${applicationId})
      `;

      created.push({
        prompt_run_id: runId,
        prompt_text: promptText,
        length_warning: warnIfPromptTooLong(promptText),
        contact_ids: batch.map((c) => c.id),
        chatgpt_url: "https://chatgpt.com/",
      });
    }

    return { reused: false as const, runs: created };
  });

  if (!reused) {
    for (const run of runs) {
      await writeAuditLog("prompt.exported", "prompt_runs", run.prompt_run_id, {
        kind: "cold_email",
        application_id: applicationId,
        contact_ids: run.contact_ids,
        resume_version: resumeVersion.version,
      });
    }
  }

  revalidateApplication(applicationId);

  return {
    primary: runs[0],
    additional_batches: runs.slice(1),
    total_contacts: selection.contacts.length,
    batch_count: runs.length,
    resume_version: resumeVersion.version,
  };
}

export async function submitColdEmailsResponse(
  promptRunId: string,
  rawResponse: string,
) {
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
      error: `This response belongs to a different prompt run (${markerId}).`,
    };
  }

  const existing = await getPromptRunById(promptRunId);
  if (!existing) {
    return { ok: false as const, error: "Prompt run not found." };
  }
  if (existing.kind !== "cold_email") {
    return { ok: false as const, error: "Not a cold email prompt run." };
  }
  if (!existing.target_entity_id) {
    return {
      ok: false as const,
      error: "Cold email prompt run is missing application link.",
    };
  }

  const applicationId = existing.target_entity_id;

  if (existing.status === "completed") {
    const emails = await listEmailsByPromptRun(promptRunId);
    return {
      ok: true as const,
      already_completed: true,
      email_ids: emails.map((e) => e.id),
    };
  }

  let expectedContactIds: string[] = [];
  try {
    expectedContactIds = extractExpectedContactIdsFromPrompt(existing.prompt_text);
  } catch {
    expectedContactIds = [];
  }

  if (expectedContactIds.length === 0) {
    return {
      ok: false as const,
      error: "Could not determine expected contacts for this prompt run.",
    };
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
    return {
      ok: false as const,
      error: message,
      repair_prompt: buildColdEmailRepairPrompt(
        [{ path: "root", message }],
        rawResponse,
        expectedContactIds,
      ),
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseExtractedJson(jsonText);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Response is not valid JSON.";
    const hint =
      /\\[^"\\/bfnrtu]/i.test(jsonText) || /\\\[/i.test(jsonText)
        ? " ChatGPT may have used invalid escapes like \\[ in markdown — try pasting again or remove backslashes before [ and ]."
        : "";
    await updatePromptRunValidationErrors(
      promptRunId,
      [{ path: "root", message: detail + hint }],
      rawResponse,
    );
    return {
      ok: false as const,
      error: `Response is not valid JSON.${hint}`,
      repair_prompt: buildColdEmailRepairPrompt(
        [{ path: "root", message: detail + hint }],
        rawResponse,
        expectedContactIds,
      ),
    };
  }

  const schemaResult = coldEmailBatchSchema.safeParse(parsedJson);
  if (!schemaResult.success) {
    const issues = zodErrorsToList(schemaResult.error);
    await updatePromptRunValidationErrors(promptRunId, issues, rawResponse);
    return {
      ok: false as const,
      error: "Cold email JSON failed schema validation.",
      validation_errors: issues,
      repair_prompt: buildColdEmailRepairPrompt(
        issues,
        rawResponse,
        expectedContactIds,
      ),
    };
  }

  const validated = validateColdEmailBatch(
    schemaResult.data,
    expectedContactIds,
  );
  if (!validated.ok) {
    await updatePromptRunValidationErrors(promptRunId, validated.issues, rawResponse);
    return {
      ok: false as const,
      error: "Cold email content failed validation.",
      validation_errors: validated.issues,
      missing_contact_ids: validated.missingContactIds,
      repair_prompt: buildColdEmailRepairPrompt(
        validated.issues,
        rawResponse,
        validated.missingContactIds,
      ),
    };
  }

  const emailIds: string[] = [];
  const profile = await getProfileRow();
  const fullName = profile?.full_name ?? null;

  for (const item of validated.matched) {
    const contact = await getContactById(item.contact_id);
    if (!contact) continue;
    const bodyMd = stripEmailSignature(item.body_md, fullName);
    const id = await insertEmail({
      application_id: applicationId,
      contact_id: item.contact_id,
      kind: "cold",
      subject: item.subject,
      body_md: bodyMd,
      body_html: markdownToEmailHtml(bodyMd),
      role_template: inferRoleTemplate(contact.role),
      prompt_run_id: promptRunId,
      draft_status: "pending",
    });
    // insertEmail returns existing id if a cold email already exists for this contact.
    if (!emailIds.includes(id)) emailIds.push(id);
  }

  const completed = await completePromptRun(
    promptRunId,
    rawResponse,
    { emails: validated.matched, email_ids: emailIds },
  );
  if (!completed) {
    return { ok: false as const, error: "Prompt run was already completed." };
  }

  await writeAuditLog("cold_emails.accepted", "prompt_runs", promptRunId, {
    application_id: applicationId,
    email_ids: emailIds,
  });

  revalidateApplication(applicationId);
  return {
    ok: true as const,
    email_ids: emailIds,
    count: emailIds.length,
  };
}

export async function createGmailDrafts(emailIds: string[]) {
  if (!emailIds.length) {
    return { ok: false as const, error: "No emails selected." };
  }

  const emails = await listEmailsByIds(emailIds);
  if (emails.length === 0) {
    return { ok: false as const, error: "Emails not found." };
  }

  let auth;
  try {
    auth = await getGoogleAuthClient();
  } catch (e) {
    if (
      e instanceof GoogleNotConnectedError ||
      e instanceof GoogleTokenRevokedError
    ) {
      return {
        ok: false as const,
        error: "Connect Google on the dashboard (needs Gmail compose scope).",
        reconnect_required: true,
      };
    }
    throw e;
  }

  const gmail = new GmailClient(auth);
  const drive = new DriveClient(auth);

  const results: {
    email_id: string;
    ok: boolean;
    draft_id?: string;
    draft_url?: string;
    error?: string;
  }[] = [];

  for (const email of emails) {
    if (email.draft_status === "creating") {
      results.push({
        email_id: email.id,
        ok: false,
        error: "Draft creation already in progress or locked.",
      });
      continue;
    }

    if (email.gmail_draft_id && email.draft_status === "created") {
      try {
        const exists = await gmail.getDraft(email.gmail_draft_id);
        if (exists) {
          results.push({
            email_id: email.id,
            ok: true,
            draft_id: email.gmail_draft_id,
            draft_url: gmailDraftWebUrl(email.gmail_draft_id),
          });
          continue;
        }
        await markEmailDraftDeletedExternally(email.id);
      } catch (e) {
        if (e instanceof GmailScopeMissingError) {
          return {
            ok: false as const,
            error: e.message,
            reconnect_required: true,
            results,
          };
        }
      }
    }

    const claimed = await claimEmailForDraftCreation(email.id);
    if (!claimed) {
      const fresh = await getEmailById(email.id);
      if (fresh?.draft_status === "created" && fresh.gmail_draft_id) {
        results.push({
          email_id: email.id,
          ok: true,
          draft_id: fresh.gmail_draft_id,
          draft_url: gmailDraftWebUrl(fresh.gmail_draft_id),
        });
      } else {
        results.push({
          email_id: email.id,
          ok: false,
          error: "Draft creation already in progress or locked.",
        });
      }
      continue;
    }

    const contact = await getContactById(email.contact_id);
    if (!contact?.email) {
      await markEmailDraftFailed(email.id, "Contact has no email address.");
      results.push({
        email_id: email.id,
        ok: false,
        error: "Contact has no email address.",
      });
      continue;
    }

    try {
      const application = await getApplicationById(email.application_id);
      const profile = await getProfileRow();
      const fullName = profile?.full_name ?? "Candidate";
      const company = application?.company ?? null;
      const role = application?.role ?? null;

      const resume = await getLatestReadyResumeVersion(email.application_id);
      const coverLetter = await getLatestReadyCoverLetterVersion(email.application_id);

      const attachments: DraftAttachment[] = [];
      const driveLinks: DraftDriveLink[] = [];
      let runningBytes = Buffer.byteLength(email.body_html || email.body_md, "utf8");
      const limit = 24 * 1024 * 1024;

      async function tryAttachPdf(
        driveFileId: string | null | undefined,
        filename: string,
        label: string,
      ) {
        if (!driveFileId) return;
        try {
          const buffer = await drive.getFile(driveFileId);
          if (runningBytes + buffer.length <= limit) {
            attachments.push({
              filename,
              mimeType: "application/pdf",
              buffer,
            });
            runningBytes += buffer.length;
          } else {
            const link = await drive.getWebViewLink(driveFileId);
            if (link) {
              driveLinks.push({ label, url: link });
            }
          }
        } catch {
          // optional attachment
        }
      }

      if (resume?.drive_pdf_id && resume.status === "ready") {
        await tryAttachPdf(
          resume.drive_pdf_id,
          buildResumePdfFilename(fullName, company, role, resume.version),
          "Resume PDF",
        );
      }

      if (coverLetter?.drive_pdf_id && coverLetter.status === "ready") {
        await tryAttachPdf(
          coverLetter.drive_pdf_id,
          buildCoverLetterPdfFilename(
            fullName,
            company,
            role,
            coverLetter.version,
          ),
          "Cover letter PDF",
        );
      }

      const bodyHtml = appendEmailSignatureHtml(
        markdownToEmailHtml(
          stripEmailSignature(email.body_md || "", fullName),
        ),
        await resolveSignatureForDraft(profile),
      );

      const created = await gmail.createDraft({
        to: contact.email,
        subject: email.subject,
        bodyHtml,
        attachments,
        driveLinks,
      });

      await markEmailDraftCreated(email.id, created.draftId, created.messageId);
      results.push({
        email_id: email.id,
        ok: true,
        draft_id: created.draftId,
        draft_url: gmailDraftWebUrl(created.draftId),
      });

      await writeAuditLog("gmail.draft_created", "emails", email.id, {
        gmail_draft_id: created.draftId,
        attachments: created.attachedFilenames,
        drive_links: created.driveLinkLabels,
      });
    } catch (e) {
      if (e instanceof GmailScopeMissingError) {
        await markEmailDraftFailed(email.id, e.message);
        return {
          ok: false as const,
          error: e.message,
          reconnect_required: true,
          results,
        };
      }
      const message = e instanceof Error ? e.message : "Draft creation failed";
      await markEmailDraftFailed(email.id, message);
      results.push({ email_id: email.id, ok: false, error: message });
    }
  }

  const applicationId = emails[0]?.application_id;
  if (applicationId) revalidateApplication(applicationId);

  const createdCount = results.filter((r) => r.ok).length;
  const hasColdDraft = emails.some(
    (e) => e.kind === "cold" && results.some((r) => r.email_id === e.id && r.ok),
  );
  const status_advance =
    applicationId && createdCount > 0 && hasColdDraft
      ? await maybeAdvanceApplicationStatus(applicationId, "gmail_draft_created")
      : undefined;

  return {
    ok: true as const,
    created: createdCount,
    total: results.length,
    summary: `${createdCount} of ${results.length} drafts created`,
    results,
    status_advance,
  };
}

export async function verifyGmailDraft(emailId: string) {
  const email = await getEmailById(emailId);
  if (!email?.gmail_draft_id) {
    return { ok: false as const, error: "No Gmail draft linked." };
  }

  try {
    const auth = await getGoogleAuthClient();
    const gmail = new GmailClient(auth);
    const exists = await gmail.getDraft(email.gmail_draft_id);
    if (!exists) {
      await markEmailDraftDeletedExternally(email.id);
      revalidateApplication(email.application_id);
      return {
        ok: false as const,
        deleted_externally: true,
        error: "Draft was deleted in Gmail. You can recreate it.",
      };
    }
    return {
      ok: true as const,
      draft_url: gmailDraftWebUrl(email.gmail_draft_id),
    };
  } catch (e) {
    if (e instanceof GmailScopeMissingError) {
      return {
        ok: false as const,
        error: e.message,
        reconnect_required: true,
      };
    }
    if (
      e instanceof GoogleNotConnectedError ||
      e instanceof GoogleTokenRevokedError
    ) {
      return {
        ok: false as const,
        error: "Connect Google first.",
        reconnect_required: true,
      };
    }
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Verification failed",
    };
  }
}

export async function recreateGmailDraft(emailId: string) {
  await resetEmailDraftForRecreate(emailId);
  return createGmailDrafts([emailId]);
}

export async function retryMissingContactsPrompt(
  applicationId: string,
  contactIds: string[],
  sharedContext?: string,
) {
  return exportColdEmailsPrompt(applicationId, {
    contactIds,
    includeRisky: true,
    sharedContext,
  });
}
