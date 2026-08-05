import { AppShell } from "@/components/layout/app-shell";
import { PaidAccessGate } from "@/components/billing/paid-access-gate";
import { SetupAccessGate } from "@/components/setup/setup-access-gate";
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
  const [user, profile, headerStore, readiness] = await Promise.all([
    getCurrentUser(),
    getProfile().catch(() => null),
    headers(),
    getSetupReadiness().catch(() => ({
      googleConnected: false,
      profileDone: false,
      masterResumeDone: false,
      setupReady: false,
    })),
  ]);

  const isPaid = user ? userHasPaidAccess(user) : true;
  const pathname = headerStore.get("x-pathname") || "";
  const setupReady = !isPaid || readiness.setupReady;

  // Server-side redirect when pathname is available from middleware.
  if (user && !isPaid && pathname && !unpaidAllowed(pathname)) {
    redirect("/billing");
  }
  // Paid users leave billing; after payment always prefer onboarding.
  if (
    user &&
    isPaid &&
    pathname &&
    (pathname === "/billing" || pathname.startsWith("/billing/"))
  ) {
    redirect(
      pathname.startsWith("/billing/razorpay/return")
        ? "/onboarding"
        : readiness.setupReady
          ? "/dashboard"
          : "/onboarding",
    );
  }
  if (
    user &&
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
      userEmail={user?.email}
      userName={profile?.full_name || user?.full_name}
      avatarSrc={profileAvatarSrc(profile)}
      isAdmin={user?.is_admin}
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
