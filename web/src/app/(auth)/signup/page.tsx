import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.must_reset_password) {
      redirect("/reset-password-required");
    }
    if (!userHasPaidAccess(user)) {
      redirect("/billing");
    }
    const ready = await getSetupReadiness().catch(() => null);
    redirect(ready?.setupReady ? "/dashboard" : "/onboarding");
  }

  return <AuthForm mode="signup" nextPath="/dashboard" />;
}
