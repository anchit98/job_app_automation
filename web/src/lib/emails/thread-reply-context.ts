import type { EmailRecord } from "@/lib/db/types";
import { getContactById, updateEmailThreadMetadata } from "@/lib/db/queries";
import { normalizeRfcMessageId } from "@/lib/emails/reply-thread";
import type { GmailClient } from "@/lib/google/gmail";

export interface ThreadReplyContext {
  threadId: string;
  rfcMessageId: string;
  originalSubject: string;
}

async function persistThreadMeta(
  emailId: string,
  threadId: string,
  rfcMessageId: string,
  originalSubject: string,
): Promise<ThreadReplyContext> {
  const normalized = normalizeRfcMessageId(rfcMessageId);
  await updateEmailThreadMetadata(emailId, threadId, normalized);
  return { threadId, rfcMessageId: normalized, originalSubject };
}

/** Resolve Gmail thread metadata for replying to a prior cold email. */
export async function resolveColdEmailThreadReplyContext(
  gmail: GmailClient,
  coldEmail: EmailRecord,
): Promise<ThreadReplyContext | null> {
  if (coldEmail.gmail_thread_id && coldEmail.gmail_rfc_message_id) {
    return {
      threadId: coldEmail.gmail_thread_id,
      rfcMessageId: normalizeRfcMessageId(coldEmail.gmail_rfc_message_id),
      originalSubject: coldEmail.subject,
    };
  }

  if (coldEmail.gmail_draft_id) {
    try {
      const meta = await gmail.getDraftMessageMetadata(coldEmail.gmail_draft_id);
      if (meta.threadId && meta.rfcMessageId) {
        return persistThreadMeta(
          coldEmail.id,
          meta.threadId,
          meta.rfcMessageId,
          coldEmail.subject,
        );
      }
    } catch {
      // Draft may have been sent or deleted — try sent-mail lookup below.
    }
  }

  const contact = await getContactById(coldEmail.contact_id);
  if (contact?.email?.trim()) {
    const sent = await gmail.findSentThreadByRecipientAndSubject(
      contact.email.trim(),
      coldEmail.subject,
    );
    if (sent?.threadId && sent.rfcMessageId) {
      return persistThreadMeta(
        coldEmail.id,
        sent.threadId,
        sent.rfcMessageId,
        coldEmail.subject,
      );
    }
  }

  return null;
}
