import { redirect } from "next/navigation";
import { AdminCenterClient } from "@/components/admin/admin-center-client";
import { requireUser } from "@/lib/auth/user";
import { getAdminCenterData } from "@/lib/admin/queries";

export default async function AdminCenterPage() {
  const admin = await requireUser();
  if (!admin.is_admin) {
    redirect("/dashboard");
  }
  const data = await getAdminCenterData();

  return (
    <div className="space-y-3">
      <div>
        <h1 className="li-page-title">Admin Center</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Manage users, monitor setup completion, and handle password recovery.
        </p>
      </div>
      <AdminCenterClient
        currentUserId={admin.id}
        users={data.users}
        resetRequests={data.resetRequests}
        activeResetLinks={data.activeResetLinks}
      />
    </div>
  );
}
