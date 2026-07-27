import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/password-recovery";
import { peekPasswordResetToken } from "@/lib/auth/password-reset";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const valid = token ? await peekPasswordResetToken(token) : false;

  if (!valid) {
    return (
      <div className="w-full max-w-md space-y-6">
        <div className="li-card p-6 text-center space-y-3">
          <h1 className="text-[24px] font-semibold text-on-surface">
            Recovery link invalid
          </h1>
          <p className="text-[14px] text-on-surface-variant">
            This recovery link is missing, expired, or already used.
          </p>
          <Link href="/forgot-password" className="li-btn-primary no-underline justify-center">
            Request another link
          </Link>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
