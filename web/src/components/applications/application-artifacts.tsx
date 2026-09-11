"use client";

import Link from "next/link";
import {
  ColdEmailSendPanel,
  EmailSendList,
  type EmailAttachment,
} from "@/components/emails/email-send-list";
import type {
  Contact,
  CoverLetterVersion,
  EmailRecord,
  ResumeVersion,
} from "@/lib/db/types";
import type { EmailSendPack } from "@/lib/emails/manual-send";

export type { EmailAttachment };

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

/**
 * Cold emails, ready to send by hand — see ColdEmailSendPanel for why the app
 * no longer creates the Gmail draft itself.
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
  return (
    <ColdEmailSendPanel
      emails={emails}
      contacts={contacts}
      sendPacks={sendPacks}
      attachments={attachments}
    />
  );
}

/**
 * Follow-ups, sent the same way as cold emails.
 *
 * No attachments: a follow-up lands on a thread where the resume has already
 * been sent once, and re-attaching it reads as a resend rather than a nudge.
 *
 * Compose links are offered despite the caveat that a URL cannot set
 * In-Reply-To, so Gmail and Outlook start a new conversation rather than
 * threading under the original. The subject is already rewritten as a reply
 * ("Re: ..."), which is what both clients group on when the header is absent,
 * and one click beats copy-paste for the common case. Copy is still there for
 * anyone who wants to paste into the real thread instead.
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
        No follow-ups written yet - press Generate once one is due.
      </p>
    );
  }
  return (
    <EmailSendList
      emails={followUps}
      contacts={contacts}
      sendPacks={sendPacks}
      attachments={[]}
      hint="Open it in your mail client, or copy it into the original thread. Mark it sent to schedule the next one."
    />
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
