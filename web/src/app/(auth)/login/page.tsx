import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    if (user.must_reset_password) {
      redirect("/reset-password-required");
    }
    if (!userHasPaidAccess(user)) {
      redirect("/billing");
    }
    const next = params.next;
    if (next?.startsWith("/") && !next.startsWith("//")) {
      redirect(next);
    }
    const ready = await getSetupReadiness().catch(() => null);
    redirect(ready?.setupReady ? "/dashboard" : "/onboarding");
  }

  return (
    <AuthForm mode="login" nextPath={params.next || "/dashboard"} />
  );
}
