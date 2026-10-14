import { UpdatePasswordForm } from "@/components/settings/update-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { listIdentityProviders, userHasPassword } from "@/lib/auth/identities";

export default async function SettingsPage() {
  const user = await requireUser();
  // An account created through Google has no password to change — it has one
  // to set. Same card either way, different verb.
  const [hasPassword, providers] = await Promise.all([
    userHasPassword(user.id),
    listIdentityProviders(user.id),
  ]);

  // There used to be a second, cut-down version of this page for unpaid
  // accounts, headed "Account locked until payment". Nothing is locked behind
  // payment any more — every account is on a plan and settings are settings —
  // so there is one page for everyone.

  return (
    <div className="space-y-3">
      <div>
        <h1 className="li-page-title">Privacy &amp; Settings</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Password and account preferences. Profile &amp; master docs live under{" "}
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
          <UpdatePasswordForm hasPassword={hasPassword} providers={providers} />
          <DeleteAccountForm userEmail={user.email} hasPassword={hasPassword} />
        </div>
        <div className="lg:col-span-4 space-y-3">
          <div className="li-card p-4">
            <h2 className="li-section-title">Profile</h2>
            <div className="mt-3">
              <Link
                href="/onboarding"
                className="inline-flex text-[13px] font-semibold text-primary hover:underline"
              >
                Open Profile →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
