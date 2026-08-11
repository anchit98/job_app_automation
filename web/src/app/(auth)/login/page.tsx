import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; cleared?: string }>;
}) {
  return <LoginPageInner searchParams={searchParams} />;
}

async function LoginPageInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; cleared?: string }>;
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

  // JWT still present but DB session gone (or invalid) — clear cookie once via
  // a full navigation to the route handler (safe here; not during RSC refresh).
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value && params.cleared !== "1") {
    const next = params.next;
    const resume =
      next?.startsWith("/") && !next.startsWith("//")
        ? `/login?cleared=1&next=${encodeURIComponent(next)}`
        : "/login?cleared=1";
    redirect(
      `/api/auth/clear-stale-session?next=${encodeURIComponent(resume)}`,
    );
  }

  return (
    <AuthForm mode="login" nextPath={params.next || "/dashboard"} />
  );
}
