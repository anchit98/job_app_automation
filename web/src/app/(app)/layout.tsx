import { AppShell } from "@/components/layout/app-shell";
import { PaidAccessGate } from "@/components/billing/paid-access-gate";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getProfile } from "@/app/actions/profile";
import { profileAvatarSrc } from "@/lib/profile-avatar";
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
  const [user, profile, headerStore] = await Promise.all([
    getCurrentUser(),
    getProfile().catch(() => null),
    headers(),
  ]);

  const isPaid = user ? userHasPaidAccess(user) : true;
  const pathname = headerStore.get("x-pathname") || "";

  // Server-side redirect when pathname is available from middleware.
  if (user && !isPaid && pathname && !unpaidAllowed(pathname)) {
    redirect("/billing");
  }
  if (user && isPaid && pathname === "/billing") {
    redirect("/dashboard");
  }

  return (
    <AppShell
      userEmail={user?.email}
      userName={profile?.full_name || user?.full_name}
      avatarSrc={profileAvatarSrc(profile)}
      isAdmin={user?.is_admin}
      isPaid={isPaid}
    >
      <PaidAccessGate isPaid={isPaid}>{children}</PaidAccessGate>
    </AppShell>
  );
}
