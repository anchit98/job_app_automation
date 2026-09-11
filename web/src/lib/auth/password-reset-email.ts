import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendTransactionalEmail } from "@/lib/emails/transactional";

function resetEmailHtml(input: {
  resetUrl: string;
  fullName?: string | null;
  /** Left unset now that the provider, not an admin account, signs the mail. */
  senderName?: string | null;
}) {
  const greet = input.fullName?.trim() ? `Hi ${input.fullName.trim()},` : "Hi,";
  const sender = input.senderName?.trim() || "JobApp OS";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#1f2937;line-height:1.6;">
      <h2 style="margin:0 0 16px 0;color:#0a66c2;">Reset your JobApp OS password</h2>
      <p>${greet}</p>
      <p>A password reset was requested for your JobApp OS account. Click the button below to choose a new password.</p>
      <p style="margin:24px 0;">
        <a href="${input.resetUrl}" style="display:inline-block;background:#0a66c2;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p>If the button does not open, use this link:</p>
      <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
      <p>This link expires in 4 hours and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <p style="margin-top:24px;">Thanks,<br/>${sender}</p>
    </div>
  `.trim();
}

export interface PasswordResetEmailResult {
  token: Awaited<ReturnType<typeof createPasswordResetToken>>;
  /** False when the provider is down or absent — the token is still valid. */
  delivered: boolean;
  delivery_error: string | null;
}

/**
 * Issue a recovery token and try to email it.
 *
 * The token is created first and kept whatever the provider does. A reset link
 * that exists but was not delivered is recoverable — an admin can hand it over
 * — while refusing to create one leaves the user with nothing at all. Delivery
 * is reported rather than thrown so the caller can decide what to show.
 */
export async function sendPasswordResetEmail(input: {
  userId: string;
  email: string;
  fullName?: string | null;
  preferredAdminId?: string;
  kind?: "forgot_password" | "admin_reset";
}): Promise<PasswordResetEmailResult> {
  const token = await createPasswordResetToken(
    input.userId,
    input.kind ?? "forgot_password",
    input.preferredAdminId ?? null,
  );

  const sent = await sendTransactionalEmail({
    to: input.email,
    subject: "JobApp OS password reset",
    bodyHtml: resetEmailHtml({
      resetUrl: token.resetUrl,
      fullName: input.fullName,
    }),
    preferredAdminId: input.preferredAdminId,
  });

  if (!sent.ok) {
    console.error("[password-reset-email] not delivered:", sent.error);
  }

  return {
    token,
    delivered: sent.ok,
    delivery_error: sent.ok ? null : sent.error,
  };
}
