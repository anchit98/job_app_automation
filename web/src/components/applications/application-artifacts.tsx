"use client";

import Link from "next/link";
import type {
  Contact,
  CoverLetterVersion,
  EmailRecord,
  ResumeVersion,
} from "@/lib/db/types";

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
        No resume yet - it will appear here after Quick Apply finishes.
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
        No cover letter yet - created automatically by Quick Apply.
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
        No contacts - add them on the Quick Apply form when you start.
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

export function EmailArtifacts({ emails }: { emails: EmailRecord[] }) {
  const cold = emails.filter((e) => e.kind === "cold");
  if (cold.length === 0) {
    return (
      <p className="text-[14px] text-on-surface-variant">
        No cold emails yet - drafted automatically by Quick Apply.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {cold.map((e) => (
        <li
          key={e.id}
          className="rounded-xl border border-outline-variant p-4 space-y-1"
        >
          <div className="text-[14px] font-medium text-on-surface">
            {e.subject}
          </div>
          <div className="text-[12px] text-on-surface-variant">
            Draft: {e.draft_status}
            {e.gmail_draft_id ? " · ready in Gmail" : ""}
          </div>
          {e.gmail_draft_id && (
            <a
              href={`https://mail.google.com/mail/u/0/#drafts`}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-primary hover:underline"
            >
              Open Gmail drafts
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AutoApplyOnlyHint() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 mb-4 text-[13px] text-on-surface-variant">
      Generation is automatic via{" "}
      <Link href="/apply" className="text-primary hover:underline">
        Quick Apply
      </Link>
      . This page is for reviewing outputs only.
    </div>
  );
}
