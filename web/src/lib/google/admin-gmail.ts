import { dbAll, dbGet } from "@/lib/db";
import { env } from "@/lib/env";
import { GmailClient } from "@/lib/google/gmail";
import { getGoogleAuthClient } from "@/lib/google/tokens";

export type GmailSenderAdmin = {
  id: string;
  email: string;
  full_name: string | null;
  scope: string;
};

export class AdminGmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminGmailConfigError";
  }
}

export async function resolveGmailSenderAdmin(
  preferredAdminId?: string,
): Promise<GmailSenderAdmin | null> {
  if (preferredAdminId) {
    const row = (await dbGet(
      `SELECT u.id, u.email, u.full_name, gt.scope
         FROM users u
         INNER JOIN google_tokens gt ON gt.user_id = u.id
        WHERE u.id = ?
          AND u.is_admin = true
          AND gt.status = 'active'`,
      preferredAdminId,
    )) as GmailSenderAdmin | undefined;
    if (row) return row;
  }

  return (
    ((await dbGet(
      `SELECT u.id, u.email, u.full_name, gt.scope
         FROM users u
         INNER JOIN google_tokens gt ON gt.user_id = u.id
        WHERE u.is_admin = true
          AND gt.status = 'active'
        ORDER BY u.created_at ASC
        LIMIT 1`,
    )) as GmailSenderAdmin | undefined) ?? null
  );
}

export async function requireGmailSenderAdmin(
  preferredAdminId?: string,
): Promise<GmailSenderAdmin> {
  const sender = await resolveGmailSenderAdmin(preferredAdminId);
  if (!sender) {
    throw new AdminGmailConfigError(
      "No admin Google account is connected. Connect Google from an admin account first.",
    );
  }
  if (!sender.scope.includes("gmail.send")) {
    throw new AdminGmailConfigError(
      "Admin Google account needs gmail.send access. Reconnect Google from the admin account, then try again.",
    );
  }
  return sender;
}

export async function sendAdminGmail(input: {
  to: string | string[];
  subject: string;
  bodyHtml: string;
  preferredAdminId?: string;
}) {
  const sender = await requireGmailSenderAdmin(input.preferredAdminId);
  const client = new GmailClient(await getGoogleAuthClient(sender.id));
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const unique = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];

  for (const to of unique) {
    await client.sendMessage({
      to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      driveLinks: [{ label: "JobApp OS", url: env.appUrl().replace(/\/$/, "") }],
    });
  }

  return { sender, emailedTo: unique };
}

export async function listAdminNotifyEmails(): Promise<string[]> {
  const configured = process.env.ADMIN_NOTIFY_EMAIL?.trim();
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
}
