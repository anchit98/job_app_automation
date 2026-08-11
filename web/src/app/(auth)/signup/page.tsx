import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { SESSION_COOKIE } from "@/lib/auth/session";
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

  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value) {
    redirect("/api/auth/clear-stale-session?next=/signup");
  }

  return <AuthForm mode="signup" nextPath="/dashboard" />;
}
