/**
 * The app's own outgoing mail — password resets, payment receipts and alerts.
 *
 * Distinct from the cold emails a user sends: those leave from the user's own
 * mail client through a compose link and need no provider at all. These come
 * from the app, so they need one.
 *
 * The provider is Resend. It used to be an admin account's Gmail, which is
 * what made the app ask for `gmail.compose` — a scope Google classifies as
 * restricted, meaning an annual paid security assessment on top of
 * verification, for the sake of a handful of transactional emails. Nothing
 * else the app wants is restricted, so Gmail alone carried that cost, and
 * moving these sends off it is what let the scope go entirely.
 *
 * Two rules everything here follows:
 *
 *   - **It never throws.** Sending is always the least important half of what
 *     a caller is doing — the password reset token is already issued, the
 *     payment is already recorded. A provider outage must not roll back work
 *     that succeeded, so failures come back as a value.
 *   - **A missing provider is not an error.** "not_configured" is reported
 *     separately from "tried and failed", because the fix is different: one is
 *     a setup step, the other is an outage to wait out.
 */
import { dbAll } from "@/lib/db";
import { env, hasResendConfig } from "@/lib/env";
import { sendViaResend } from "@/lib/emails/providers/resend";

export type TransactionalProvider = "resend";

export type TransactionalSendResult =
  | { ok: true; provider: TransactionalProvider; emailed_to: string[] }
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
}

const NOT_CONFIGURED =
  "The app cannot send email yet — set RESEND_API_KEY and TRANSACTIONAL_FROM_EMAIL (on a domain verified in Resend).";

function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

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
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "send_failed",
      error: "No valid recipient address.",
    };
  }

  if (!hasResendConfig()) {
    return { ok: false, reason: "not_configured", error: NOT_CONFIGURED };
  }

  const sent = await sendViaResend({
    to: recipients,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
  });
  if (sent.ok) {
    return { ok: true, provider: "resend", emailed_to: recipients };
  }
  console.error("[transactional-email] send failed:", sent.error);
  return { ok: false, reason: "send_failed", error: sent.error };
}

/**
 * Can the app send its own mail at all?
 *
 * Read before doing work that is only worth doing if an email follows, and to
 * tell an admin why a recovery link has to be handed over by hand.
 */
export function transactionalEmailAvailable(): {
  available: boolean;
  provider: TransactionalProvider | null;
  detail: string;
} {
  if (hasResendConfig()) {
    return {
      available: true,
      provider: "resend",
      detail: `Sending as ${env.transactionalFromEmail()} via Resend`,
    };
  }
  return { available: false, provider: null, detail: NOT_CONFIGURED };
}

/**
 * Admin recipients for app notifications, or an empty list.
 *
 * `ADMIN_NOTIFY_EMAIL` wins when set; otherwise every admin account is told.
 * Nothing about this is Gmail-specific — it only lived next to the Gmail
 * sender because that used to be the only way mail left the app.
 */
export async function transactionalAdminRecipients(): Promise<string[]> {
  try {
    const configured = env.adminNotifyEmail().trim();
    if (configured) {
      return configured
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }

    const rows = (await dbAll(
      `SELECT email FROM users WHERE is_admin = true ORDER BY created_at ASC`,
    )) as Array<{ email: string }>;
    return rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  } catch (error) {
    console.error("[transactional-email] admin recipients lookup failed:", error);
    return [];
  }
}
