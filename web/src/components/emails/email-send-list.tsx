"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markEmailSentManually, undoEmailSent } from "@/app/actions/emails";
import type { Contact, EmailRecord } from "@/lib/db/types";
import {
  COMPOSE_PLATFORMS,
  COMPOSE_PLATFORM_LABELS,
  buildComposeLinks,
  isComposePlatform,
  type ComposePlatform,
  type EmailSendPack,
} from "@/lib/emails/manual-send";

/** One file the user has to attach by hand — a URL cannot carry it. */
export interface EmailAttachment {
  label: string;
  href: string;
}

/**
 * "send" offers the compose deep links; "copy" offers only the clipboard.
 *
 * Follow-ups are copy-only on purpose. A follow-up belongs on the original
 * thread, and no compose URL can set In-Reply-To — opening one starts a fresh
 * conversation instead. Pasting into the existing thread in the user's own
 * mailbox is the only way it actually threads, and since we capture no message
 * ids there is nothing for the app to reply to on its own.
 */
export type SendListMode = "send" | "copy";

const PLATFORM_STORAGE_KEY = "jobapp_compose_platform";
const DEFAULT_PLATFORM: ComposePlatform = "gmail";

/**
 * The chosen mail client, as a tiny external store.
 *
 * localStorage is exactly the "external system" useSyncExternalStore exists
 * for: the value has to survive reloads, it is unavailable while rendering on
 * the server, and every panel on the page should agree on it — picking Outlook
 * on the cold email card should not leave the follow-up card on Gmail.
 */
let cachedPlatform: ComposePlatform | null = null;
const platformListeners = new Set<() => void>();

function readStoredPlatform(): ComposePlatform {
  if (cachedPlatform) return cachedPlatform;
  try {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY);
    cachedPlatform =
      stored && isComposePlatform(stored) ? stored : DEFAULT_PLATFORM;
  } catch {
    // Private mode or storage disabled — the default is a fine answer.
    cachedPlatform = DEFAULT_PLATFORM;
  }
  return cachedPlatform;
}

function serverPlatform(): ComposePlatform {
  return DEFAULT_PLATFORM;
}

function subscribeToPlatform(onChange: () => void): () => void {
  platformListeners.add(onChange);
  return () => platformListeners.delete(onChange);
}

function setStoredPlatform(next: ComposePlatform): void {
  cachedPlatform = next;
  try {
    localStorage.setItem(PLATFORM_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const listener of platformListeners) listener();
}

/** Which mail client to open, remembered across emails and pages. */
export function useComposePlatform(): [
  ComposePlatform,
  (next: ComposePlatform) => void,
] {
  const platform = useSyncExternalStore(
    subscribeToPlatform,
    readStoredPlatform,
    serverPlatform,
  );
  return [platform, setStoredPlatform];
}

export function ComposePlatformSelect({
  value,
  onChange,
  id = "compose-platform",
}: {
  value: ComposePlatform;
  onChange: (next: ComposePlatform) => void;
  id?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-[12px] font-medium text-on-surface-variant whitespace-nowrap"
      >
        Send with
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            if (isComposePlatform(e.target.value)) onChange(e.target.value);
          }}
          className="appearance-none cursor-pointer rounded-lg border border-border-hairline bg-surface pl-3 pr-8 py-1.5 text-[13px] font-semibold text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          {COMPOSE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {COMPOSE_PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-on-surface-variant"
          aria-hidden
        >
          <span className="material-symbols-outlined text-[16px] leading-none">
            expand_more
          </span>
        </span>
      </div>
    </div>
  );
}

export function CopyButton({
  value,
  label,
  variant = "ghost",
}: {
  value: string;
  label: string;
  variant?: "ghost" | "primary";
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
      className={
        variant === "primary"
          ? "bg-primary text-on-primary text-[13px] font-medium px-4 py-1.5 rounded-full hover:opacity-90"
          : "text-[12px] font-medium text-on-surface-variant hover:text-primary"
      }
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
  platform,
  mode,
}: {
  email: EmailRecord;
  contact: Contact | undefined;
  pack: EmailSendPack | undefined;
  attachments: EmailAttachment[];
  platform: ComposePlatform;
  mode: SendListMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sent = email.draft_status === "sent";
  const links = pack && pack.to ? buildComposeLinks(pack) : null;
  const compose = links ? links[platform] : null;

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

      {pack && mode === "copy" && (
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={pack.body_text} label="Copy email" variant="primary" />
          <CopyButton value={pack.subject} label="Copy subject" />
        </div>
      )}

      {compose && mode === "send" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={compose.url}
              target={platform === "mailto" ? undefined : "_blank"}
              rel="noreferrer"
              className="bg-primary text-on-primary text-[13px] font-medium px-4 py-1.5 rounded-full hover:opacity-90"
            >
              Open in {COMPOSE_PLATFORM_LABELS[platform]}
            </a>
            <CopyButton value={pack!.subject} label="Copy subject" />
            <CopyButton value={pack!.body_text} label="Copy body" />
          </div>

          {!compose.body_included && (
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

      {mode === "send" && attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="text-on-surface-variant">Attach before sending:</span>
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

export function EmailSendList({
  emails,
  contacts,
  sendPacks,
  attachments,
  hint,
  mode = "send",
}: {
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
  attachments: EmailAttachment[];
  hint: string;
  mode?: SendListMode;
}) {
  const [platform, setPlatform] = useComposePlatform();
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const packByEmail = new Map(sendPacks.map((p) => [p.email_id, p]));
  const sentCount = emails.filter((e) => e.draft_status === "sent").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-on-surface-variant">
          {sentCount} of {emails.length} sent. {hint}
        </p>
        {mode === "send" && (
          <ComposePlatformSelect value={platform} onChange={setPlatform} />
        )}
      </div>
      <ul className="space-y-3">
        {emails.map((email) => (
          <EmailSendCard
            key={email.id}
            email={email}
            contact={contactById.get(email.contact_id)}
            pack={packByEmail.get(email.id)}
            attachments={attachments}
            platform={platform}
            mode={mode}
          />
        ))}
      </ul>
    </div>
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
export function ColdEmailSendPanel({
  emails,
  contacts,
  sendPacks,
  attachments,
  emptyText = "No cold emails yet - drafted automatically by Apply.",
}: {
  emails: EmailRecord[];
  contacts: Contact[];
  sendPacks: EmailSendPack[];
  attachments: EmailAttachment[];
  emptyText?: string;
}) {
  const cold = emails.filter((e) => e.kind === "cold");
  if (cold.length === 0) {
    return <p className="text-[14px] text-on-surface-variant">{emptyText}</p>;
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
