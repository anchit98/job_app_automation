import { env } from "@/lib/env";
import {
  AdminGmailConfigError,
  listAdminNotifyEmails,
  sendAdminGmail,
} from "@/lib/google/admin-gmail";
import { paymentReviewUrl } from "@/lib/billing/payment-review-token";

function paymentClaimHtml(input: {
  payerEmail: string;
  payerName?: string | null;
  upiReference: string;
  reviewUrl: string;
  adminUrl: string;
  amountInr: string;
}) {
  const who = input.payerName?.trim()
    ? `${input.payerName.trim()} (${input.payerEmail})`
    : input.payerEmail;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;line-height:1.6;">
      <h2 style="margin:0 0 16px 0;color:#0a66c2;">New UPI payment to approve</h2>
      <p>Someone submitted a payment claim on JobApp OS.</p>
      <ul>
        <li><strong>User:</strong> ${who}</li>
        <li><strong>Amount:</strong> ₹${input.amountInr}</li>
        <li><strong>UTR / UPI reference:</strong> ${input.upiReference}</li>
      </ul>
      <p style="margin:24px 0 12px 0;">
        <a href="${input.reviewUrl}" style="display:inline-block;background:#057642;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700;font-size:16px;">
          Review on phone
        </a>
      </p>
      <p style="margin:0 0 24px 0;font-size:13px;color:#666666;">
        Opens a mobile page to approve or reject. Link expires in 7 days.
      </p>
      <p style="margin:0 0 8px 0;">
        <a href="${input.adminUrl}" style="color:#0a66c2;font-weight:600;text-decoration:none;">
          Open Admin Center instead →
        </a>
      </p>
      <p>Verify the transfer in your UPI app before approving.</p>
    </div>
  `.trim();
}

/**
 * Emails admins when a user submits a payment claim.
 * Failures are returned so the claim itself can still succeed.
 */
export async function notifyAdminsOfPaymentClaim(input: {
  claimId: string;
  payerEmail: string;
  payerName?: string | null;
  upiReference: string;
}): Promise<{ ok: true; emailedTo: string[] } | { ok: false; error: string }> {
  try {
    const recipients = await listAdminNotifyEmails();
    if (recipients.length === 0) {
      return { ok: false, error: "No admin email addresses to notify." };
    }

    const appUrl = env.appUrl().replace(/\/$/, "");
    const reviewUrl = await paymentReviewUrl(input.claimId);
    const result = await sendAdminGmail({
      to: recipients,
      subject: `JobApp OS: payment claim from ${input.payerEmail}`,
      bodyHtml: paymentClaimHtml({
        payerEmail: input.payerEmail,
        payerName: input.payerName,
        upiReference: input.upiReference,
        reviewUrl,
        adminUrl: `${appUrl}/admin-center`,
        amountInr: env.paymentAmountInr(),
      }),
    });
    return { ok: true, emailedTo: result.emailedTo };
  } catch (error) {
    const message =
      error instanceof AdminGmailConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to send payment notification email.";
    console.error("[payment-claim-email]", error);
    return { ok: false, error: message };
  }
}
