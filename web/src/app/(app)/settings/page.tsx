import { ExtensionSettingsPanel } from "@/components/settings/extension-settings-panel";
import { UpdatePasswordForm } from "@/components/settings/update-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { ReopenSetupGuideButton } from "@/components/setup/reopen-setup-guide-button";
import Link from "next/link";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";

export default async function SettingsPage() {
  const user = await requireUser();
  const isPaid = userHasPaidAccess(user);

  if (!isPaid) {
    return (
      <div className="space-y-3 max-w-2xl">
        <div>
          <h1 className="li-page-title">Privacy &amp; Settings</h1>
          <p className="text-[14px] text-on-surface-variant mt-1">
            Change your password or delete your account. Full settings unlock
            after payment.
          </p>
        </div>
        <div className="li-card-flat p-4 border-l-4 border-l-status-waiting bg-status-waiting-container flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-on-surface">
              Account locked until payment
            </p>
            <p className="li-meta mt-1">
              Pay via UPI and submit your reference for admin approval.
            </p>
          </div>
          <Link
            href="/billing"
            className="li-btn-primary text-[13px] no-underline justify-center shrink-0"
          >
            Open billing
          </Link>
        </div>
        <UpdatePasswordForm />
        <DeleteAccountForm userEmail={user.email} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="li-page-title">Privacy &amp; Settings</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Password, extension bridge, and account preferences. Profile &amp;
          master docs live under{" "}
          <Link
            href="/onboarding"
            className="text-primary font-semibold hover:underline"
          >
            Profile
          </Link>
          .
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <div className="lg:col-span-8 space-y-3">
          <UpdatePasswordForm />
          <ExtensionSettingsPanel />
          <DeleteAccountForm userEmail={user.email} />
        </div>
        <div className="lg:col-span-4 space-y-3">
          <div className="li-card p-4">
            <h2 className="li-section-title">Setup guide</h2>
            <p className="li-meta mt-1">
              Google Cloud Console, Connect Google, profile, and extension
              install, all on Dashboard.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/dashboard"
                className="inline-flex text-[13px] font-semibold text-primary hover:underline"
              >
                Open Dashboard →
              </Link>
              <ReopenSetupGuideButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
