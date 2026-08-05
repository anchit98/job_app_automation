import { dbAll } from "@/lib/db";
import {
  listActivePasswordResetTokens,
  listOpenPasswordResetRequests,
} from "@/lib/auth/password-reset";
import { listPendingPaymentClaims } from "@/lib/billing/payment-claims";
import { listRecentRazorpayPaymentLinks } from "@/lib/billing/razorpay-payment-links";
import { profileFieldsComplete } from "@/lib/setup/profile-complete";

export type AdminUserSummary = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  must_reset_password: boolean;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  google_connected: boolean;
  profile_done: boolean;
  resume_done: boolean;
  setup_completed: boolean;
  /** Latest pipeline run per application ended `completed`. */
  apps_passed: number;
  /** Latest pipeline run per application ended `failed` or `needs_manual`. */
  apps_failed: number;
};

async function loadAppOutcomeCountsByUser(): Promise<
  Map<string, { passed: number; failed: number }>
> {
  const rows = (await dbAll(
    `SELECT user_id,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS apps_passed,
            COUNT(*) FILTER (WHERE status IN ('failed', 'needs_manual'))::int AS apps_failed
       FROM (
         SELECT DISTINCT ON (application_id)
                user_id, application_id, status
           FROM pipeline_runs
          ORDER BY application_id, created_at::timestamptz DESC
       ) latest
      GROUP BY user_id`,
  )) as Array<{
    user_id: string;
    apps_passed: number;
    apps_failed: number;
  }>;

  const map = new Map<string, { passed: number; failed: number }>();
  for (const row of rows) {
    map.set(row.user_id, {
      passed: Number(row.apps_passed) || 0,
      failed: Number(row.apps_failed) || 0,
    });
  }
  return map;
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const [rows, outcomeCounts] = await Promise.all([
    dbAll(
      `SELECT u.id, u.email, u.full_name, u.is_admin, u.must_reset_password,
              u.is_paid, u.paid_at, u.created_at,
              p.full_name AS profile_full_name,
              p.location AS profile_location,
              p.phone AS profile_phone,
              p.linkedin_url AS profile_linkedin_url,
              mr.content AS resume_content,
              gt.status AS google_status
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN master_resume mr ON mr.user_id = u.id
         LEFT JOIN google_tokens gt ON gt.user_id = u.id
        ORDER BY u.created_at DESC`,
    ) as Promise<
      Array<{
        id: string;
        email: string;
        full_name: string | null;
        is_admin: boolean;
        must_reset_password: boolean;
        is_paid: boolean;
        paid_at: string | null;
        created_at: string;
        profile_full_name: string | null;
        profile_location: string | null;
        profile_phone: string | null;
        profile_linkedin_url: string | null;
        resume_content: string | null;
        google_status: string | null;
      }>
    >,
    loadAppOutcomeCountsByUser(),
  ]);

  return rows.map((row) => {
    const resumeDone = Boolean(
      row.resume_content && row.resume_content !== "{}",
    );
    const profileDone = profileFieldsComplete({
      full_name: row.profile_full_name || row.full_name,
      location: row.profile_location,
      phone: row.profile_phone,
      linkedin_url: row.profile_linkedin_url,
    });
    const googleConnected = row.google_status === "active";
    const isAdmin = Boolean(row.is_admin);
    const outcomes = outcomeCounts.get(row.id);
    return {
      id: row.id,
      email: row.email,
      full_name: row.profile_full_name || row.full_name,
      is_admin: isAdmin,
      must_reset_password: Boolean(row.must_reset_password),
      is_paid: isAdmin || Boolean(row.is_paid),
      paid_at: row.paid_at,
      created_at: row.created_at,
      google_connected: googleConnected,
      profile_done: profileDone,
      resume_done: resumeDone,
      setup_completed: googleConnected && profileDone && resumeDone,
      apps_passed: outcomes?.passed ?? 0,
      apps_failed: outcomes?.failed ?? 0,
    };
  });
}

export async function getAdminCenterData() {
  const [
    users,
    resetRequests,
    activeResetLinks,
    pendingPaymentClaims,
    recentRazorpayPaymentLinks,
  ] = await Promise.all([
    listAdminUsers(),
    listOpenPasswordResetRequests(),
    listActivePasswordResetTokens(),
    listPendingPaymentClaims(),
    listRecentRazorpayPaymentLinks(25),
  ]);
  return {
    users,
    resetRequests,
    activeResetLinks,
    pendingPaymentClaims,
    recentRazorpayPaymentLinks,
  };
}
