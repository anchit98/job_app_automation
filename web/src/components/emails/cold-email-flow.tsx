"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGmailDrafts,
  exportColdEmailsPrompt,
  getEmailsForApplication,
  recreateGmailDraft,
  retryMissingContactsPrompt,
  submitColdEmailsResponse,
  type ContactEligibility,
} from "@/app/actions/emails";
import { abandonPromptRun } from "@/app/actions/prompts";
import { resolveStatusAdvance } from "@/lib/applications/status-advance-client";
import { UnifiedPasteModal } from "@/components/paste-flow/unified-paste-modal";
import type { Contact, EmailRecord } from "@/lib/db/types";
import { gmailDraftWebUrl } from "@/lib/emails/gmail-url";

interface ColdEmailFlowProps {
  applicationId: string;
  initialEmails: EmailRecord[];
  initialContacts: Contact[];
  googleConnected: boolean;
}

const ELIGIBILITY_LABEL: Record<ContactEligibility, string> = {
  eligible: "Ready",
  risky: "Risky - opt in",
  no_email: "No email",
  already_has_cold_email: "Already drafted",
};

const DRAFT_STATUS_LABEL: Record<EmailRecord["draft_status"], string> = {
  pending: "Pending draft",
  creating: "Creating…",
  created: "In Gmail",
  failed: "Failed",
  deleted_externally: "Deleted in Gmail",
};

export function ColdEmailFlow({
  applicationId,
  initialEmails,
  initialContacts,
  googleConnected,
}: ColdEmailFlowProps) {
  const router = useRouter();
  const [emails, setEmails] = useState(initialEmails);
  const [includeRisky, setIncludeRisky] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sharedContext, setSharedContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftSummary, setDraftSummary] = useState<string | null>(null);

  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [pendingBatches, setPendingBatches] = useState<
    { prompt_run_id: string; prompt_text: string; length_warning: string | null }[]
  >([]);
  const [missingContactIds, setMissingContactIds] = useState<string[]>([]);

  const [pending, startTransition] = useTransition();

  const contactById = useMemo(() => {
    const map = new Map(initialContacts.map((c) => [c.id, c]));
    return map;
  }, [initialContacts]);

  const eligibleContacts = useMemo(() => {
    return initialContacts.filter((c) => {
      if (!c.email?.trim() || c.verification_status === "no_email_available") {
        return false;
      }
      if (c.verification_status === "risky" && !includeRisky) return false;
      const hasCold = emails.some(
        (e) => e.kind === "cold" && e.contact_id === c.id,
      );
      return !hasCold;
    });
  }, [initialContacts, emails, includeRisky]);

  function refresh() {
    startTransition(async () => {
      const data = await getEmailsForApplication(applicationId);
      setEmails(data);
      router.refresh();
    });
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllEligible() {
    setSelectedIds(eligibleContacts.map((c) => c.id));
  }

  function startGenerate() {
    setError(null);
    setDraftSummary(null);
    setMissingContactIds([]);
    startTransition(async () => {
      try {
        const result = await exportColdEmailsPrompt(applicationId, {
          contactIds: selectedIds.length ? selectedIds : undefined,
          includeRisky,
          sharedContext: sharedContext || undefined,
        });
        setPromptRunId(result.primary.prompt_run_id);
        setPromptText(result.primary.prompt_text);
        setLengthWarning(result.primary.length_warning);
        setPendingBatches(
          result.additional_batches.map((b) => ({
            prompt_run_id: b.prompt_run_id,
            prompt_text: b.prompt_text,
            length_warning: b.length_warning,
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to export prompt");
      }
    });
  }

  function handleCancel() {
    if (!promptRunId) return;
    startTransition(async () => {
      await abandonPromptRun(promptRunId);
      for (const batch of pendingBatches) {
        await abandonPromptRun(batch.prompt_run_id);
      }
      setPromptRunId(null);
      setPromptText(null);
      setPendingBatches([]);
    });
  }

  async function handleCustomSubmit(raw: string) {
    if (!promptRunId) {
      return { ok: false, error: "Missing prompt run." };
    }
    const result = await submitColdEmailsResponse(promptRunId, raw);
    if (result.ok) {
      refresh();
      if (pendingBatches.length > 0) {
        const [next, ...rest] = pendingBatches;
        setPendingBatches(rest);
        setTimeout(() => {
          setPromptRunId(next.prompt_run_id);
          setPromptText(next.prompt_text);
          setLengthWarning(next.length_warning);
          setError(
            `Batch accepted. ${rest.length + 1} batch(es) remaining - run the next prompt.`,
          );
        }, 100);
      } else {
        setPromptRunId(null);
        setPromptText(null);
      }
    } else if ("missing_contact_ids" in result && result.missing_contact_ids) {
      setMissingContactIds(result.missing_contact_ids);
    }
    return result;
  }

  function createDrafts(ids?: string[]) {
    setError(null);
    setDraftSummary(null);
    const targetIds =
      ids ??
      emails
        .filter((e) =>
          ["pending", "failed", "deleted_externally"].includes(e.draft_status),
        )
        .map((e) => e.id);

    if (!targetIds.length) {
      setError("No emails need draft creation.");
      return;
    }

    startTransition(async () => {
      const result = await createGmailDrafts(targetIds);
      if (!result.ok) {
        setError(result.error);
        if ("results" in result && result.results) {
          setDraftSummary(
            `Partial: ${(result.results as { ok: boolean }[]).filter((r) => r.ok).length} succeeded before fail.`,
          );
        }
        refresh();
        return;
      }
      setDraftSummary(result.summary);
      await resolveStatusAdvance(applicationId, result.status_advance, router);
      refresh();
    });
  }

  function retryMissing() {
    if (!missingContactIds.length) return;
    startTransition(async () => {
      try {
        const result = await retryMissingContactsPrompt(
          applicationId,
          missingContactIds,
          sharedContext || undefined,
        );
        setPromptRunId(result.primary.prompt_run_id);
        setPromptText(result.primary.prompt_text);
        setLengthWarning(result.primary.length_warning);
        setPendingBatches([]);
        setMissingContactIds([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Retry failed");
      }
    });
  }

  const pendingDraftCount = emails.filter((e) =>
    ["pending", "failed", "deleted_externally"].includes(e.draft_status),
  ).length;

  return (
    <div className="space-y-6">
      {!googleConnected && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant flex gap-2">
          <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
          <p>
            Connect Google on the dashboard (Gmail compose) before creating drafts.
            You can still generate email copy via ChatGPT first.
          </p>
        </div>
      )}

      <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-[16px] font-medium text-on-surface">
            Generate cold emails
          </h2>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            One ChatGPT round-trip writes personalized emails for up to 5 contacts.
            Risky contacts are excluded unless you opt in.
          </p>
        </div>

        <div>
          <label className="text-[12px] font-medium text-on-surface-variant block mb-1">
            Additional email instructions (optional)
          </label>
          <textarea
            value={sharedContext}
            onChange={(e) => setSharedContext(e.target.value)}
            placeholder="e.g. Mention I'm open to relocating. Shared alma mater: Georgia Tech. Ask about the product discovery process. Keep each email under 120 words."
            className="w-full h-24 bg-surface-container-low border border-outline-variant rounded-lg p-3 text-[14px] text-on-surface resize-none"
          />
          <p className="li-meta mt-1">
            Included in the ChatGPT cold-email prompt for openings and content guidance.
          </p>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-on-surface">
          <input
            type="checkbox"
            checked={includeRisky}
            onChange={(e) => setIncludeRisky(e.target.checked)}
            className="rounded border-outline-variant"
          />
          Include Risky Mailmeteor contacts in generation
        </label>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
              Contacts for this batch
            </span>
            <button
              type="button"
              onClick={selectAllEligible}
              className="text-[12px] text-primary hover:underline"
            >
              Select all eligible ({eligibleContacts.length})
            </button>
          </div>
          {initialContacts.length === 0 ? (
            <p className="text-[14px] text-on-surface-variant">
              Add contacts on the Contacts tab first.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {initialContacts.map((c) => {
                const hasCold = emails.some(
                  (e) => e.kind === "cold" && e.contact_id === c.id,
                );
                let eligibility: ContactEligibility = "eligible";
                if (hasCold) eligibility = "already_has_cold_email";
                else if (
                  !c.email?.trim() ||
                  c.verification_status === "no_email_available"
                ) {
                  eligibility = "no_email";
                } else if (c.verification_status === "risky" && !includeRisky) {
                  eligibility = "risky";
                }
                const selectable = eligibility === "eligible";
                return (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                      selectable
                        ? "border-outline-variant bg-surface-container-low"
                        : "border-outline-variant/50 opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!selectable}
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-on-surface">
                          {c.name}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-on-surface-variant">
                          {ELIGIBILITY_LABEL[eligibility]}
                        </span>
                      </div>
                      <p className="text-[12px] text-on-surface-variant truncate">
                        {c.role || "-"} · {c.email || "no email"}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={startGenerate}
          disabled={pending || eligibleContacts.length === 0}
          className="bg-primary text-on-primary text-[14px] font-medium px-6 py-2 rounded-full hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Preparing…" : "Generate cold emails (ChatGPT)"}
        </button>

        {error && (
          <p className="rounded-lg bg-error-container p-3 text-[14px] text-on-error-container">
            {error}
          </p>
        )}
        {draftSummary && (
          <p className="rounded-lg bg-secondary-container p-3 text-[14px] text-on-secondary-container">
            {draftSummary}
          </p>
        )}
        {missingContactIds.length > 0 && (
          <div className="rounded-lg border border-outline-variant p-3 space-y-2">
            <p className="text-[13px] text-on-surface">
              ChatGPT omitted {missingContactIds.length} contact(s). Retry just those.
            </p>
            <button
              type="button"
              onClick={retryMissing}
              className="text-[13px] text-primary hover:underline"
            >
              Retry these {missingContactIds.length} contacts
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface-container border border-outline-variant rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium text-on-surface">
            Emails ({emails.length})
          </h2>
          <button
            type="button"
            onClick={() => createDrafts()}
            disabled={pending || pendingDraftCount === 0 || !googleConnected}
            className="bg-secondary-container text-on-secondary-container text-[13px] font-medium px-4 py-2 rounded-full disabled:opacity-50"
          >
            Create drafts ({pendingDraftCount})
          </button>
        </div>

        {emails.length === 0 ? (
          <p className="text-[14px] text-on-surface-variant">
            No cold emails yet. Generate a batch once you have contacts and a resume.
          </p>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => {
              const contact = contactById.get(email.contact_id);
              return (
                <div
                  key={email.id}
                  className="bg-surface-container-low border border-outline-variant rounded-lg p-4 space-y-2"
                >
                  <div className="flex justify-between gap-3 items-start">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-on-surface truncate">
                        {email.subject}
                      </p>
                      <p className="text-[12px] text-on-surface-variant mt-0.5">
                        To: {contact?.name ?? "Unknown"}
                        {contact?.email ? ` <${contact.email}>` : ""}
                        {email.role_template ? ` · ${email.role_template}` : ""}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        email.draft_status === "created"
                          ? "bg-secondary-container text-on-secondary-container"
                          : email.draft_status === "failed"
                            ? "bg-error-container text-on-error-container"
                            : "bg-surface-variant text-on-surface-variant"
                      }`}
                    >
                      {DRAFT_STATUS_LABEL[email.draft_status]}
                    </span>
                  </div>
                  <pre className="text-[12px] text-on-surface-variant whitespace-pre-wrap max-h-28 overflow-y-auto font-sans">
                    {email.body_md.slice(0, 500)}
                    {email.body_md.length > 500 ? "…" : ""}
                  </pre>
                  {email.draft_error && (
                    <p className="text-[12px] text-error">{email.draft_error}</p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {email.draft_status === "created" && email.gmail_draft_id && (
                      <>
                        <a
                          href={gmailDraftWebUrl(email.gmail_draft_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Open draft in Gmail
                          <span className="material-symbols-outlined text-[14px]">
                            open_in_new
                          </span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            startTransition(async () => {
                              await recreateGmailDraft(email.id);
                              refresh();
                            });
                          }}
                          disabled={pending || !googleConnected}
                          className="text-[12px] font-medium text-on-surface-variant hover:text-primary disabled:opacity-50"
                        >
                          Recreate draft
                        </button>
                      </>
                    )}
                    {["pending", "failed", "deleted_externally"].includes(
                      email.draft_status,
                    ) && (
                      <button
                        type="button"
                        onClick={() => createDrafts([email.id])}
                        disabled={pending || !googleConnected}
                        className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {email.draft_status === "failed" ||
                        email.draft_status === "deleted_externally"
                          ? "Retry draft"
                          : "Create draft"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {promptText && promptRunId ? (
        <UnifiedPasteModal
          title={
            pendingBatches.length > 0
              ? `Cold emails (batch - ${pendingBatches.length} more after this)`
              : "Cold emails"
          }
          promptRunId={promptRunId}
          promptText={promptText}
          lengthWarning={lengthWarning}
          open
          onClose={handleCancel}
          onSuccess={() => {
            refresh();
          }}
          customSubmit={handleCustomSubmit}
        />
      ) : null}
    </div>
  );
}
