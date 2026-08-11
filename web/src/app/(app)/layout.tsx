import { AppShell } from "@/components/layout/app-shell";
import { PaidAccessGate } from "@/components/billing/paid-access-gate";
import { SetupAccessGate } from "@/components/setup/setup-access-gate";
import { HardRedirect } from "@/components/auth/hard-redirect";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getProfile } from "@/app/actions/profile";
import { profileAvatarSrc } from "@/lib/profile-avatar";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { setupAllowed, setupLockedPath } from "@/lib/setup/setup-paths";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Routes unpaid users may still open fully. */
const UNPAID_ALLOWED = [
  "/billing",
  "/settings",
  "/reset-password-required",
];

/** Skip setup/resume fan-out — these pages don't need the setup gate data. */
function skipSetupReadiness(pathname: string) {
  return (
    pathname.startsWith("/admin-center") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/billing") ||
    pathname === "/reset-password-required"
  );
}

function unpaidAllowed(pathname: string) {
  return UNPAID_ALLOWED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") || "";
  const lightLayout = skipSetupReadiness(pathname);

  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    // Transient auth failures must not tear down the shell mid-refresh.
    console.error("[layout] getCurrentUser failed:", error);
    user = null;
  }

  const [profile, readiness] = await Promise.all([
    getProfile().catch(() => null),
    lightLayout
      ? Promise.resolve({
          googleConnected: true,
          profileDone: true,
          masterResumeDone: true,
          setupReady: true,
        })
      : getSetupReadiness().catch(() => ({
          googleConnected: false,
          profileDone: false,
          masterResumeDone: false,
          setupReady: false,
        })),
  ]);

  // Hard client redirect — never throw redirect() here during Flight refresh
  // after Doc sync/reset (production shows a digest-only RSC error).
  if (!user) {
    return <HardRedirect href="/login" label="Returning to sign in…" />;
  }

  const isPaid = userHasPaidAccess(user);
  const setupReady = !isPaid || readiness.setupReady;

  // Server-side redirect when pathname is available from middleware.
  if (!isPaid && pathname && !unpaidAllowed(pathname)) {
    redirect("/billing");
  }
  // Paid users leave billing; after payment always prefer onboarding.
  if (
    isPaid &&
    pathname &&
    (pathname === "/billing" || pathname.startsWith("/billing/"))
  ) {
    const ready = lightLayout
      ? (await getSetupReadiness().catch(() => ({ setupReady: false }))).setupReady
      : readiness.setupReady;
    redirect(
      pathname.startsWith("/billing/razorpay/return")
        ? "/onboarding"
        : ready
          ? "/dashboard"
          : "/onboarding",
    );
  }
  if (
    isPaid &&
    !readiness.setupReady &&
    pathname &&
    setupLockedPath(pathname) &&
    !setupAllowed(pathname)
  ) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      userEmail={user.email}
      userName={profile?.full_name || user.full_name}
      avatarSrc={profileAvatarSrc(profile)}
      isAdmin={user.is_admin}
      isPaid={isPaid}
      setupReady={setupReady}
    >
      <PaidAccessGate isPaid={isPaid}>
        <SetupAccessGate isPaid={isPaid} setupReady={setupReady}>
          {children}
        </SetupAccessGate>
      </PaidAccessGate>
    </AppShell>
  );
}
