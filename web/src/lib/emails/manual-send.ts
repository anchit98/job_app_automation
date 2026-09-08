/**
 * Send a cold email without touching the Gmail API.
 *
 * Creating a draft through the API needs `gmail.compose`, which Google
 * classifies as a restricted scope: public launch requires an annual paid
 * security assessment on top of verification. Nothing else the app asks for
 * does, so Gmail alone carries that cost.
 *
 * A compose deep link gets to the same place for nothing. `?view=cm` opens
 * Gmail's own compose window with to / subject / body already filled, `mailto:`
 * does the same in whatever client the user actually uses, and Gmail autosaves
 * what it opens — so the user still ends up with a draft, just without the app
 * ever holding a Gmail permission.
 *
 * Two things a URL cannot do, and both shape the UI that uses this:
 *   - It cannot attach a file. No mail scheme allows it (deliberately — a page
 *     could otherwise attach anything off your disk), so the resume is offered
 *     as a download and the user attaches it themselves.
 *   - It cannot carry HTML. The body is plain text, so the markdown is
 *     flattened here rather than rendered.
 *
 * Client-safe: pure functions, no server imports.
 */
import {
  buildEmailSignatureText,
  type EmailSignatureProfile,
} from "@/lib/emails/signature";

/**
 * How long a compose URL may get before the body is left out of it.
 *
 * Over the limit nothing errors — the body is silently cut, which is the worst
 * possible failure because the user sends a half-written email without
 * noticing. So we check first and hand the body to a copy button instead.
 *
 * `mailto:` is passed to an OS handler, and the Windows shell has historically
 * truncated around 2,000 characters. Gmail's is a plain HTTPS request and
 * survives far more; 6,000 keeps a margin under the usual 8k server ceiling.
 */
export const MAILTO_URL_LIMIT = 1900;
export const GMAIL_URL_LIMIT = 6000;

const GMAIL_COMPOSE_BASE = "https://mail.google.com/mail/?view=cm&fs=1";

/** Everything needed to open one email in a mail client. */
export interface EmailSendPack {
  email_id: string;
  to: string;
  subject: string;
  /** Markdown flattened and signature appended — ready to paste as-is. */
  body_text: string;
}

export interface ComposeTarget {
  url: string;
  /**
   * False when the email was too long for the URL and the link carries only
   * the recipient and subject. The UI must then point at the copy button.
   */
  body_included: boolean;
}

export interface ComposeLinks {
  gmail: ComposeTarget;
  mailto: ComposeTarget;
}

/**
 * An email address needs no escaping in practice, and some mail handlers
 * mishandle a percent-encoded "@" — so encode everything except that.
 */
function encodeAddress(address: string): string {
  return encodeURIComponent(address.trim()).replace(/%40/g, "@");
}

/**
 * Flatten markdown to the plain text a compose window will show.
 *
 * A link keeps its URL in parentheses: the whole point of a cold email is that
 * the recruiter can reach the portfolio, and "see my work" with the href
 * stripped out is a dead end.
 */
export function emailBodyToPlainText(markdown: string): string {
  return (
    markdown
      .replace(/\r\n/g, "\n")
      // Images carry nothing in a plain-text email.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_full, label: string, url: string) =>
        label.trim() === url.trim() ? url : `${label} (${url})`,
      )
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}[-*_]{3,}\s*$/gm, "")
      .replace(/^(\s*)[*+]\s+/gm, "$1- ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Assemble the text the user will actually send.
 *
 * The signature is included rather than left to Gmail's own: it carries the
 * phone number and the LinkedIn / portfolio links, which is the part of a cold
 * email a recruiter acts on.
 */
export function buildEmailSendPack(input: {
  email_id: string;
  to: string;
  subject: string;
  body_md: string;
  signature: EmailSignatureProfile;
}): EmailSendPack {
  const body = emailBodyToPlainText(input.body_md);
  const signature = buildEmailSignatureText(input.signature);
  return {
    email_id: input.email_id,
    to: input.to.trim(),
    subject: input.subject.trim(),
    body_text: signature ? `${body}\n\n${signature}` : body,
  };
}

/**
 * Gmail web compose link.
 *
 * Deliberately not `/mail/u/0/`: that opens whichever Google account signed in
 * first, so someone with a work and a personal account can end up applying
 * from the wrong one. Without it, Google picks.
 */
function gmailUrl(pack: EmailSendPack, withBody: boolean): string {
  const parts = [
    GMAIL_COMPOSE_BASE,
    `to=${encodeAddress(pack.to)}`,
    // Gmail's subject parameter is "su", not "subject".
    `su=${encodeURIComponent(pack.subject)}`,
  ];
  if (withBody) parts.push(`body=${encodeURIComponent(pack.body_text)}`);
  return parts.join("&");
}

/** Works with whatever client the machine is set up for, Gmail or not. */
function mailtoUrl(pack: EmailSendPack, withBody: boolean): string {
  const params = [`subject=${encodeURIComponent(pack.subject)}`];
  if (withBody) {
    // RFC 6068 wants CRLF line breaks; some Windows handlers drop bare LFs.
    params.push(
      `body=${encodeURIComponent(pack.body_text.replace(/\n/g, "\r\n"))}`,
    );
  }
  return `mailto:${encodeAddress(pack.to)}?${params.join("&")}`;
}

/** Both links, each dropping the body only if it would not survive the trip. */
export function buildComposeLinks(pack: EmailSendPack): ComposeLinks {
  const withBody = { gmail: gmailUrl(pack, true), mailto: mailtoUrl(pack, true) };
  return {
    gmail:
      withBody.gmail.length <= GMAIL_URL_LIMIT
        ? { url: withBody.gmail, body_included: true }
        : { url: gmailUrl(pack, false), body_included: false },
    mailto:
      withBody.mailto.length <= MAILTO_URL_LIMIT
        ? { url: withBody.mailto, body_included: true }
        : { url: mailtoUrl(pack, false), body_included: false },
  };
}
