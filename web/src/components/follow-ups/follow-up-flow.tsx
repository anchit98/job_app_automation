"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  manualSendFollowUp,
  runFollowUpNow,
  skipFollowUp,
  snoozeFollowUp,
  submitFollowUpResponse,
} from "@/app/actions/follow-ups";
import { UnifiedPasteModal } from "@/components/paste-flow/unified-paste-modal";
import type { Contact, EmailRecord, FollowUp } from "@/lib/db/types";
import { gmailDraftWebUrl } from "@/lib/emails/gmail-url";

const STATUS_LABEL: Record<FollowUp["status"], string> = {
  waiting: "Waiting for #1",
  pending: "Scheduled",
  processing: "Processing…",
  enqueued: "Ready to paste / draft",
  snoozed: "Snoozed",
  skipped: "Skipped",
  sent: "Sent",
};

interface FollowUpFlowProps {
  applicationId: string;
  followUps: FollowUp[];
  emails: EmailRecord[];
  contacts: Contact[];
  applicationStatus: string;
}

export function FollowUpFlow({
  applicationId,
  followUps,
  emails,
  contacts,
  applicationStatus,
}: FollowUpFlowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [promptRunId, setPromptRunId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [activeFollowUpId, setActiveFollowUpId] = useState<string | null>(null);
  const [lengthWarning, setLengthWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailById = new Map(emails.map((e) => [e.id, e]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const needsConfirm = [
    "hr_replied",
    "interview_scheduled",
    "offer",
    "accepted",
  ].includes(applicationStatus);

  function runNow(followUpId: string, force = false) {
    setError(null);
    startTransition(async () => {
      const result = await runFollowUpNow(followUpId, { force });
      if (!result.ok) {
        if (result.needs_confirmation && !force) {
          const ok = window.confirm(
            "This application already has a response. Run the follow-up anyway?",
          );
          if (ok) runNow(followUpId, true);
          return;
        }
        setError(result.error);
        return;
      }
      setPromptRunId(result.prompt_run_id);
      setPromptText(result.prompt_text);
      setLengthWarning(result.length_warning);
      setActiveFollowUpId(followUpId);
    });
  }

  function snooze(id: string, days: number) {
    startTransition(async () => {
      const result = await snoozeFollowUp(id, days);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function skip(id: string) {
    startTransition(async () => {
      const result = await skipFollowUp(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function manualSend(id: string) {
    startTransition(async () => {
      const result = await manualSendFollowUp(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.gmail_url) {
        window.open(result.gmail_url, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    });
  }

  if (followUps.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant">
        Follow-ups are scheduled when you mark the application as{" "}
        <strong>Email sent</strong> (one pair per Gmail draft created).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[16px] font-medium text-on-surface">Follow-ups</h3>
        <p className="text-[13px] text-on-surface-variant mt-1">
          Cadence: 5 business days after email sent, then 10 business days after
          the first follow-up is sent. Times use your profile timezone. Gmail
          drafts reply in the original cold-email thread (no re-attached PDFs).
        </p>
        {needsConfirm && (
          <p className="text-[12px] text-amber-700 dark:text-amber-300 mt-2">
            Application status suggests a reply - you will be asked to confirm
            before running a follow-up.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-error-container text-on-error-container p-3 text-[13px]">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {followUps.map((fu) => {
          const email = emailById.get(fu.email_id);
          const contact = email ? contactById.get(email.contact_id) : null;
          const draftEmail = fu.draft_email_id
            ? emailById.get(fu.draft_email_id) ??
              emails.find((e) => e.id === fu.draft_email_id)
            : null;

          return (
            <li
              key={fu.id}
              className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-medium text-on-surface">
                    Follow-up #{fu.sequence}
                    {contact ? ` - ${contact.name}` : ""}
                  </p>
                  <p className="text-[12px] text-on-surface-variant">
                    {STATUS_LABEL[fu.status]}
                    {fu.due_at && fu.status !== "sent"
                      ? ` · due ${new Date(fu.due_at).toLocaleString()}`
                      : ""}
                    {fu.sent_at
                      ? ` · sent ${new Date(fu.sent_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                {draftEmail?.gmail_draft_id && (
                  <a
                    href={gmailDraftWebUrl(draftEmail.gmail_draft_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-primary hover:underline"
                  >
                    Open Gmail draft
                  </a>
                )}
              </div>

              {!["sent", "skipped"].includes(fu.status) && (
                <div className="flex flex-wrap gap-2">
                  {(fu.status === "pending" ||
                    fu.status === "snoozed" ||
                    fu.status === "enqueued") && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => runNow(fu.id)}
                      className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-[12px] font-medium disabled:opacity-50"
                    >
                      {fu.status === "enqueued" && fu.prompt_run_id
                        ? "Open prompt"
                        : "Run now"}
                    </button>
                  )}
                  {fu.draft_email_id && fu.status !== "sent" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => manualSend(fu.id)}
                      className="px-3 py-1.5 rounded-full border border-outline-variant text-[12px] hover:bg-surface-container-high disabled:opacity-50"
                    >
                      Create draft & open Gmail
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => snooze(fu.id, 3)}
                    className="px-3 py-1.5 rounded-full border border-outline-variant text-[12px] disabled:opacity-50"
                  >
                    Snooze +3 days
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => snooze(fu.id, 5)}
                    className="px-3 py-1.5 rounded-full border border-outline-variant text-[12px] disabled:opacity-50"
                  >
                    Snooze +1 week
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => skip(fu.id)}
                    className="px-3 py-1.5 rounded-full text-[12px] text-on-surface-variant disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <UnifiedPasteModal
        title="Follow-up email"
        copyPromptLabel="Copy follow-up prompt"
        promptRunId={promptRunId || ""}
        promptText={promptText || ""}
        lengthWarning={lengthWarning}
        open={Boolean(promptText && promptRunId && activeFollowUpId)}
        onClose={() => {
          setPromptRunId(null);
          setPromptText(null);
          setActiveFollowUpId(null);
        }}
        onSuccess={() => {
          setPromptRunId(null);
          setPromptText(null);
          setActiveFollowUpId(null);
          router.refresh();
        }}
        customSubmit={async (raw) => {
          if (!activeFollowUpId || !promptRunId) {
            return { ok: false, error: "Missing follow-up context." };
          }
          return submitFollowUpResponse(promptRunId, raw, activeFollowUpId);
        }}
      />
    </div>
  );
}
