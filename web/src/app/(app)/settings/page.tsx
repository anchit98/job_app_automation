import { ExtensionSettingsPanel } from "@/components/settings/extension-settings-panel";
import { UpdatePasswordForm } from "@/components/settings/update-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { ReopenSetupGuideButton } from "@/components/setup/reopen-setup-guide-button";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";

export default async function SettingsPage() {
  const user = await requireUser();

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
              install — all on Home.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/dashboard"
                className="inline-flex text-[13px] font-semibold text-primary hover:underline"
              >
                Open Home →
              </Link>
              <ReopenSetupGuideButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
