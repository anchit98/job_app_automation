/**
 * The app's own outgoing mail — password resets, payment notifications.
 *
 * Distinct from the cold emails a user sends: those now leave from the user's
 * own mail client through a compose link and need no provider at all. These
 * come from the app, so they need one.
 *
 * Today the provider is an admin account's Gmail, which is also the last thing
 * holding the restricted `gmail.compose` scope. When that moves to Resend or
 * SES, this module is the only place that changes.
 *
 * Two rules everything here follows:
 *
 *   - **It never throws.** Sending is always the least important half of what
 *     a caller is doing — the password reset token is already issued, the
 *     payment claim is already recorded. A provider outage must not roll back
 *     work that succeeded, so failures come back as a value.
 *   - **A missing provider is not an error.** "not_configured" is reported
 *     separately from "tried and failed", because the fix is different: one is
 *     a setup step, the other is an outage to wait out.
 */
import {
  AdminGmailConfigError,
  listAdminNotifyEmails,
  sendAdminGmail,
} from "@/lib/google/admin-gmail";

export type TransactionalSendResult =
  | { ok: true; provider: string; emailed_to: string[] }
  | {
      ok: false;
      /** No provider is set up yet — a configuration gap, not a failure. */
      reason: "not_configured";
      error: string;
    }
  | {
      ok: false;
      /** A provider exists and refused or was unreachable. */
      reason: "send_failed";
      error: string;
    };

export interface TransactionalEmail {
  to: string | string[];
  subject: string;
  bodyHtml: string;
  /** Send from this admin's Gmail when there is more than one. */
  preferredAdminId?: string;
}

/** Which provider is carrying the app's own mail right now. */
export const TRANSACTIONAL_PROVIDER = "admin_gmail";

/**
 * Send, and report what happened instead of raising it.
 *
 * Callers decide how much a failure matters. Nobody has to wrap this in a
 * try/catch, which is the point — an unguarded call site is how a provider
 * outage turns into a 500 on someone's password reset.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmail,
): Promise<TransactionalSendResult> {
  try {
    const result = await sendAdminGmail({
      to: input.to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      preferredAdminId: input.preferredAdminId,
    });
    return {
      ok: true,
      provider: TRANSACTIONAL_PROVIDER,
      emailed_to: result.emailedTo,
    };
  } catch (error) {
    if (error instanceof AdminGmailConfigError) {
      return { ok: false, reason: "not_configured", error: error.message };
    }
    console.error("[transactional-email] send failed:", error);
    return {
      ok: false,
      reason: "send_failed",
      error:
        error instanceof Error
          ? error.message
          : "Could not send the email. Try again shortly.",
    };
  }
}

/**
 * Can the app send its own mail at all?
 *
 * Read before doing work that is only worth doing if an email follows, and to
 * tell an admin why a recovery link has to be handed over by hand.
 */
export async function transactionalEmailAvailable(): Promise<{
  available: boolean;
  provider: string | null;
  detail: string;
}> {
  try {
    const { requireGmailSenderAdmin } = await import(
      "@/lib/google/admin-gmail"
    );
    const sender = await requireGmailSenderAdmin();
    return {
      available: true,
      provider: TRANSACTIONAL_PROVIDER,
      detail: `Sending as ${sender.email}`,
    };
  } catch (error) {
    return {
      available: false,
      provider: null,
      detail:
        error instanceof Error
          ? error.message
          : "No transactional email provider is configured.",
    };
  }
}

/** Admin recipients for app notifications, or an empty list. */
export async function transactionalAdminRecipients(): Promise<string[]> {
  try {
    return await listAdminNotifyEmails();
  } catch (error) {
    console.error("[transactional-email] admin recipients lookup failed:", error);
    return [];
  }
}
