/**
 * The receipt a user gets when their payment unlocks the app.
 *
 * There was none. Payment produced an admin alert and a silently flipped flag,
 * so the only confirmation was that the paywall stopped appearing — and a UPI
 * transfer sitting unreviewed looked exactly the same as one that failed.
 *
 * Every unlock route sends this: the two Razorpay paths and both UPI approval
 * paths. Delivery is best-effort by construction — `sendTransactionalEmail`
 * returns failures rather than raising them, and the lookup around it is
 * guarded, because a receipt that could not be sent must never undo a payment
 * that was.
 */
import { env } from "@/lib/env";
import { getUserById } from "@/lib/auth/user";
import { formatAppDateTime } from "@/lib/datetime/india";
import { sendTransactionalEmail } from "@/lib/emails/transactional";

export interface PaymentReceiptInput {
  userId: string;
  /** "₹299" — already formatted, since the sources disagree on units. */
  amountInr: string;
  /** What the money bought, in the user's words: "Lifetime access". */
  planLabel: string;
  /** UTR for UPI, payment id for Razorpay — whatever the user can look up. */
  reference: string;
  /** How it was paid, for the line that says so. */
  method: "razorpay" | "upi";
}

function receiptHtml(input: {
  greeting: string;
  amountInr: string;
  planLabel: string;
  reference: string;
  method: string;
  paidAt: string;
  appUrl: string;
}): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;line-height:1.6;">
      <h2 style="margin:0 0 16px 0;color:#0a66c2;">Payment received — JobApp OS is unlocked</h2>
      <p>${input.greeting}</p>
      <p>Thanks — your payment went through and your account is active. Here is your receipt.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:700;">${input.amountInr}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Plan</td><td style="padding:6px 0;text-align:right;">${input.planLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Paid via</td><td style="padding:6px 0;text-align:right;">${input.method}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${input.reference}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;text-align:right;">${input.paidAt}</td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${input.appUrl}/dashboard" style="display:inline-block;background:#0a66c2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Open JobApp OS
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280;">Keep this email for your records. Reply to it if anything looks wrong.</p>
    </div>
  `.trim();
}

const METHOD_LABELS: Record<PaymentReceiptInput["method"], string> = {
  razorpay: "Razorpay",
  upi: "UPI transfer",
};

/**
 * Send the receipt. Returns whether it went out; never throws.
 *
 * Callers log the result at most — by the time this runs the payment is
 * recorded and the account is unlocked, and neither depends on the email.
 */
export async function sendPaymentReceipt(
  input: PaymentReceiptInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await getUserById(input.userId);
    if (!user?.email) {
      return { ok: false, error: "No email address on the account." };
    }

    const name = user.full_name?.trim();
    const sent = await sendTransactionalEmail({
      to: user.email,
      subject: `JobApp OS receipt — ${input.amountInr}`,
      bodyHtml: receiptHtml({
        greeting: name ? `Hi ${name},` : "Hi,",
        amountInr: input.amountInr,
        planLabel: input.planLabel,
        reference: input.reference || "—",
        method: METHOD_LABELS[input.method],
        paidAt: formatAppDateTime(new Date().toISOString()),
        appUrl: env.appUrl().replace(/\/$/, ""),
      }),
    });

    if (!sent.ok) {
      console.error("[payment-receipt] not delivered:", sent.error);
      return { ok: false, error: sent.error };
    }
    return { ok: true };
  } catch (error) {
    console.error("[payment-receipt] failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Receipt send failed.",
    };
  }
}

/** Rupees from paise, as the receipt prints them. */
export function formatPaiseAsInr(paise: number): string {
  if (!Number.isFinite(paise)) return `₹${env.paymentAmountInr()}`;
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}
