"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markEmailSentManually,
  undoEmailSent,
} from "@/app/actions/emails";
import type {
  Contact,
  CoverLetterVersion,
  EmailRecord,
  ResumeVersion,
} from "@/lib/db/types";
import {
  buildComposeLinks,
  type EmailSendPack,
} from "@/lib/emails/manual-send";

export function ResumeArtifacts({
  applicationId,
  versions,
}: {
  applicationId: string;
  versions: ResumeVersion[];
}) {
  if (versions.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No resume yet - it will appear here after Apply finishes.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {versions.map((v) => (
        <li
          key={v.id}
          className="rounded-xl border border-outline-variant p-4 flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-[14px] font-medium text-on-surface">
              Resume v{v.version}
            </div>
            <div className="text-[12px] text-on-surface-variant">{v.status}</div>
          </div>
          {v.status === "ready" && (
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={`/api/applications/${applicationId}/resume/${v.version}/pdf`}
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                Download PDF
              </a>
              <a
                href={`/api/applications/${applicationId}/resume/${v.version}/open`}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-on-surface-variant hover:text-primary hover:underline"
              >
                Open
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CoverLetterArtifacts({
  applicationId,
  versions,
}: {
  applicationId: string;
  versions: CoverLetterVersion[];
}) {
  if (versions.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No cover letter yet - created automatically by Apply.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {versions.map((v) => (
        <li
          key={v.id}
          className="rounded-xl border border-outline-variant p-4 flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-[14px] font-medium text-on-surface">
              Cover letter v{v.version}
            </div>
            <div className="text-[12px] text-on-surface-variant">{v.status}</div>
          </div>
          {v.status === "ready" && (
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={`/api/applications/${applicationId}/cover-letter/${v.version}/pdf`}
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                Download PDF
              </a>
              <a
                href={`/api/applications/${applicationId}/cover-letter/${v.version}/open`}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-on-surface-variant hover:text-primary hover:underline"
              >
                Open
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ContactArtifacts({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No contacts - add them on the Apply form when you start.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {contacts.map((c) => (
        <li
          key={c.id}
          className="rounded-xl border border-outline-variant p-4"
        >
          <div className="text-[14px] font-medium text-on-surface">{c.name}</div>
          <div className="text-[12px] text-on-surface-variant">
            {c.role || "-"} · {c.email}
          </div>
          {c.linkedin_url && (
            <a
              href={c.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-primary hover:underline"
            >
              LinkedIn
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One file the user has to attach by hand — a URL cannot carry it. */
export interface EmailAttachment {
  label: string;
  href: string;
}

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked (insecure origin, or the user said no). The text
      // is on screen and selectable, so this is a dead end, not a failure.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="text-[12px] font-medium text-on-surface-variant hover:text-primary"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function EmailSendCard({
  email,
  contact,
  pack,
  attachments,
}: {
  email: EmailRecord;
  contact: Contact | undefined;
  pack: EmailSendPack | undefined;
  attachments: EmailAttachment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sent = email.draft_status === "sent";
  const links = pack && pack.to ? buildComposeLinks(pack) : null;

  function setSent(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = next
        ? await markEmailSentManually(email.id)
        : await undoEmailSent(email.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-outline-variant p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-on-surface">
            {email.subject}
          </div>
          <div className="text-[12px] text-on-surface-variant">
            To: {contact?.name ?? "Unknown"}
            {pack?.to ? ` <${pack.to}>` : " · no email address"}
          </div>
        </div>
        <span
          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${
            sent
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-surface-variant text-on-surface-variant"
          }`}
        >
          {sent ? "Sent" : "Ready to send"}
        </span>
      </div>

      {pack?.body_text && (
        <pre className="text-[12px] text-on-surface-variant whitespace-pre-wrap max-h-40 overflow-y-auto font-sans rounded-lg bg-surface-container-low p-3">
          {pack.body_text}
        </pre>
      )}

      {links && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={links.gmail.url}
              target="_blank"
              rel="noreferrer"
              className="bg-primary text-on-primary text-[13px] font-medium px-4 py-1.5 rounded-full hover:opacity-90"
            >
              Open in Gmail
            </a>
            <a
              href={links.mailto.url}
              className="bg-secondary-container text-on-secondary-container text-[13px] font-medium px-4 py-1.5 rounded-full hover:opacity-90"
            >
              Open in mail app
            </a>
            <CopyButton value={pack!.subject} label="Copy subject" />
            <CopyButton value={pack!.body_text} label="Copy body" />
          </div>

          {!links.gmail.body_included && (
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              This email is too long to travel in a link — the compose window
              will open with the recipient and subject only. Use Copy body and
              paste it in.
            </p>
          )}
        </>
      )}

      {!pack?.to && (
        <p className="text-[12px] text-error">
          This contact has no email address, so there is nobody to send to. Add
          one on the Contacts tab.
        </p>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="text-on-surface-variant">
            Attach before sending:
          </span>
          {attachments.map((file) => (
            <a
              key={file.href}
              href={file.href}
              className="font-medium text-primary hover:underline"
            >
              {file.label}
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {sent ? (
          <>
            <span className="text-[12px] text-on-surface-variant">
              Marked as sent.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSent(false)}
              className="text-[12px] font-medium text-on-surface-variant hover:text-primary disabled:opacity-50"
            >
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setSent(true)}
            className="text-[13px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            Mark as sent
          </button>
        )}
        {email.gmail_draft_id && (
          <a
            href="https://mail.google.com/mail/u/0/#drafts"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-on-surface-variant hover:text-primary hover:underline"
          >
            Open Gmail drafts
          </a>
        )}
      </div>

      {error && <p className="text-[12px] text-error">{error}</p>}
    </li>
  );
}

/**
 * Cold emails, ready to send by hand.
 *
 * The app used to create the Gmail draft itself, which needed the restricted
 * gmail.compose scope. These open a compose window through a plain link
 * instead — no Google permission, and it works for someone whose mail is
 * Outlook. The two things the link cannot do are the two controls here: the
 * resume is attached by the user, and "Mark as sent" is how the app finds out
 * the email went.
 */
export function EmailArtifacts({
  emails,
  contacts,
  sendPacks,
  attachments,
}: {
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
  attachments: EmailAttachment[];
}) {
  const cold = emails.filter((e) => e.kind === "cold");
  if (cold.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No cold emails yet - drafted automatically by Apply.
      </p>
    );
  }

  return (
    <EmailSendList
      emails={cold}
      contacts={contacts}
      sendPacks={sendPacks}
      attachments={attachments}
      hint="Open one, attach the resume, send it from your own account, then mark it sent here so follow-ups get scheduled."
    />
  );
}

/**
 * Follow-ups, sent the same way.
 *
 * No attachments: a follow-up lands on a thread where the resume has already
 * been sent once, and re-attaching it reads as a resend rather than a nudge.
 */
export function FollowUpEmailArtifacts({
  emails,
  contacts,
  sendPacks,
}: {
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
}) {
  const followUps = emails.filter((e) => e.kind === "follow_up");
  if (followUps.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No follow-ups written yet - press Follow up once one is due.
      </p>
    );
  }
  return (
    <EmailSendList
      emails={followUps}
      contacts={contacts}
      sendPacks={sendPacks}
      attachments={[]}
      hint="The subject replies to your original email so it threads on their side. Mark it sent to schedule the next one."
    />
  );
}

function EmailSendList({
  emails,
  contacts,
  sendPacks,
  attachments,
  hint,
}: {
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
  attachments: EmailAttachment[];
  hint: string;
}) {
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const packByEmail = new Map(sendPacks.map((p) => [p.email_id, p]));
  const sentCount = emails.filter((e) => e.draft_status === "sent").length;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-on-surface-variant">
        {sentCount} of {emails.length} sent. {hint}
      </p>
      <ul className="space-y-3">
        {emails.map((email) => (
          <EmailSendCard
            key={email.id}
            email={email}
            contact={contactById.get(email.contact_id)}
            pack={packByEmail.get(email.id)}
            attachments={attachments}
          />
        ))}
      </ul>
    </div>
  );
}

export function AutoApplyOnlyHint() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 mb-4 text-[13px] text-on-surface-variant">
      Generation is automatic via{" "}
      <Link href="/apply" className="text-primary hover:underline">
        Apply
      </Link>
      . This page is for reviewing outputs only.
    </div>
  );
}
