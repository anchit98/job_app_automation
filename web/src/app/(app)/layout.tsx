import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth/user";
import { getProfile } from "@/app/actions/profile";
import { profileAvatarSrc } from "@/lib/profile-avatar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getProfile().catch(() => null),
  ]);
  return (
    <AppShell
      userEmail={user?.email}
      userName={profile?.full_name || user?.full_name}
      avatarSrc={profileAvatarSrc(profile)}
    >
      {children}
    </AppShell>
  );
}
