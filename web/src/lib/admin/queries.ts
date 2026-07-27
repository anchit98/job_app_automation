import { dbAll } from "@/lib/db";
import {
  listActivePasswordResetTokens,
  listOpenPasswordResetRequests,
} from "@/lib/auth/password-reset";

export type AdminUserSummary = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  must_reset_password: boolean;
  created_at: string;
  console_done: boolean;
  google_connected: boolean;
  profile_done: boolean;
  extension_configured: boolean;
  setup_completed: boolean;
};

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const rows = (await dbAll(
    `SELECT u.id, u.email, u.full_name, u.is_admin, u.must_reset_password, u.created_at,
            p.full_name AS profile_full_name,
            p.setup_console_done_at,
            mr.content AS resume_content,
            gt.status AS google_status,
            et.user_id AS extension_user_id,
            et.revoked_at AS extension_revoked_at
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN master_resume mr ON mr.user_id = u.id
       LEFT JOIN google_tokens gt ON gt.user_id = u.id
       LEFT JOIN extension_tokens et ON et.user_id = u.id
      ORDER BY u.created_at DESC`,
  )) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    is_admin: boolean;
    must_reset_password: boolean;
    created_at: string;
    profile_full_name: string | null;
    setup_console_done_at: string | null;
    resume_content: string | null;
    google_status: string | null;
    extension_user_id: string | null;
    extension_revoked_at: string | null;
  }>;

  return rows.map((row) => {
    const resume =
      row.resume_content && row.resume_content !== "{}" ? row.resume_content : null;
    const profileDone = Boolean((row.profile_full_name || row.full_name) && resume);
    const consoleDone = Boolean(row.setup_console_done_at);
    const googleConnected = row.google_status === "active";
    const extensionConfigured =
      Boolean(row.extension_user_id) && row.extension_revoked_at == null;
    return {
      id: row.id,
      email: row.email,
      full_name: row.profile_full_name || row.full_name,
      is_admin: Boolean(row.is_admin),
      must_reset_password: Boolean(row.must_reset_password),
      created_at: row.created_at,
      console_done: consoleDone,
      google_connected: googleConnected,
      profile_done: profileDone,
      extension_configured: extensionConfigured,
      setup_completed:
        consoleDone && googleConnected && profileDone && extensionConfigured,
    };
  });
}

export async function getAdminCenterData() {
  const [users, resetRequests, activeResetLinks] = await Promise.all([
    listAdminUsers(),
    listOpenPasswordResetRequests(),
    listActivePasswordResetTokens(),
  ]);
  return { users, resetRequests, activeResetLinks };
}
