import { createPasswordResetToken } from "@/lib/auth/password-reset";
import {
  AdminGmailConfigError,
  requireGmailSenderAdmin,
  sendAdminGmail,
} from "@/lib/google/admin-gmail";

function resetEmailHtml(input: {
  resetUrl: string;
  fullName?: string | null;
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

export class PasswordResetEmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetEmailConfigError";
  }
}

export async function sendPasswordResetEmail(input: {
  userId: string;
  email: string;
  fullName?: string | null;
  preferredAdminId?: string;
  kind?: "forgot_password" | "admin_reset";
}) {
  let sender;
  try {
    sender = await requireGmailSenderAdmin(input.preferredAdminId);
  } catch (error) {
    if (error instanceof AdminGmailConfigError) {
      throw new PasswordResetEmailConfigError(
        error.message.includes("gmail.send")
          ? error.message
          : "Password recovery email is not available yet. Connect an admin Google account first.",
      );
    }
    throw error;
  }

  const token = await createPasswordResetToken(
    input.userId,
    input.kind ?? "forgot_password",
    sender.id,
  );

  await sendAdminGmail({
    to: input.email,
    subject: "JobApp OS password reset",
    bodyHtml: resetEmailHtml({
      resetUrl: token.resetUrl,
      fullName: input.fullName,
      senderName: sender.full_name || sender.email,
    }),
    preferredAdminId: sender.id,
  });

  return token;
}
