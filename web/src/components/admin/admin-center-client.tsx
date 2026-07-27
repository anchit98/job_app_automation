"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminCreateRecoveryLink,
  adminCreateUser,
  adminResetUserPassword,
} from "@/app/actions/admin";
import type { AdminUserSummary } from "@/lib/admin/queries";

type ResetRequest = {
  id: string;
  user_id: string;
  created_at: string;
  email: string;
  full_name: string | null;
};

type ActiveResetLink = {
  id: string;
  user_id: string;
  kind: "forgot_password" | "admin_reset";
  expires_at: string;
  created_at: string;
  email: string;
  full_name: string | null;
};

export function AdminCenterClient({
  currentUserId,
  users,
  resetRequests,
  activeResetLinks,
}: {
  currentUserId: string;
  users: AdminUserSummary[];
  resetRequests: ResetRequest[];
  activeResetLinks: ActiveResetLink[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createForm, setCreateForm] = useState({ email: "", full_name: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRequestUsers = useMemo(
    () => new Set(resetRequests.map((request) => request.user_id)),
    [resetRequests],
  );

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <section className="li-card p-5 space-y-4">
        <div>
          <h2 className="li-section-title">Add user</h2>
          <p className="li-meta mt-1">
            New users get the default password <code>abc12345</code> and are forced
            to change it after first login.
          </p>
        </div>
        <form
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            clearFeedback();
            startTransition(async () => {
              const result = await adminCreateUser(createForm);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage(
                `Created ${result.user.email}. Default password: ${result.defaultPassword}`,
              );
              setCreateForm({ email: "", full_name: "" });
              router.refresh();
            });
          }}
        >
          <input
            className="rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            placeholder="Full name"
            value={createForm.full_name}
            onChange={(e) =>
              setCreateForm((current) => ({ ...current, full_name: e.target.value }))
            }
          />
          <input
            type="email"
            className="rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            placeholder="Email"
            value={createForm.email}
            onChange={(e) =>
              setCreateForm((current) => ({ ...current, email: e.target.value }))
            }
          />
          <button
            type="submit"
            disabled={pending}
            className="li-btn-primary justify-center disabled:opacity-50"
          >
            Add user
          </button>
        </form>
        {message ? (
          <p className="rounded-md bg-success-container/40 px-3 py-2 text-[13px] text-on-surface">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-error-container/40 px-3 py-2 text-[13px] text-error">
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 li-card overflow-hidden">
          <div className="border-b border-border-muted px-5 py-4">
            <h2 className="li-section-title">Users</h2>
            <p className="li-meta mt-1">
              Tracks who has logged in and whether their 4-step setup is complete.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-container-low text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Setup</th>
                  <th className="px-4 py-3 font-semibold">Flags</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {users.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-on-surface">
                        {user.full_name || "Unnamed user"}
                      </div>
                      <div className="li-meta">{user.email}</div>
                      <div className="li-meta">Joined {formatDate(user.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        ok={user.setup_completed}
                        label={user.setup_completed ? "Completed" : "Pending"}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <SmallPill ok={user.console_done} label="Console" />
                        <SmallPill ok={user.google_connected} label="Google" />
                        <SmallPill ok={user.profile_done} label="Profile" />
                        <SmallPill ok={user.extension_configured} label="Bridge" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {user.is_admin ? <SmallTag label="Admin" /> : null}
                        {user.must_reset_password ? (
                          <SmallTag label="Must reset password" />
                        ) : null}
                        {pendingRequestUsers.has(user.id) ? (
                          <SmallTag label="Recovery requested" />
                        ) : null}
                        {user.id === currentUserId ? <SmallTag label="You" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          className="li-btn-secondary text-[12px] justify-center disabled:opacity-50"
                          onClick={() => {
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminResetUserPassword({
                                userId: user.id,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(
                                `Password reset for ${user.email}. Default password: ${result.defaultPassword}`,
                              );
                              router.refresh();
                            });
                          }}
                        >
                          Reset to abc12345
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="li-btn-ghost text-[12px] justify-center disabled:opacity-50"
                          onClick={() => {
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminCreateRecoveryLink({
                                userId: user.id,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(
                                `Password reset email sent to ${result.emailedTo}. Link expires ${formatDateTime(result.expires_at)}.`,
                              );
                              router.refresh();
                            });
                          }}
                        >
                          Email reset link
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 li-meta">
                      No users yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <section className="li-card p-4">
            <h2 className="li-section-title">Password recovery</h2>
            <p className="li-meta mt-1">
              Forgot-password and admin resets email a one-time link to the user.
              The link opens the reset page and validates the token before allowing
              a new password.
            </p>
          </section>

          <section className="li-card p-4">
            <h2 className="li-section-title">Active recovery emails</h2>
            <ul className="mt-3 space-y-3">
              {activeResetLinks.map((link) => (
                <li key={link.id} className="rounded-lg border border-border-hairline p-3">
                  <div className="text-[13px] font-semibold text-on-surface">
                    {link.full_name || link.email}
                  </div>
                  <div className="li-meta">
                    {link.kind === "forgot_password"
                      ? "User forgot password"
                      : "Sent by admin"}
                  </div>
                  <div className="li-meta mt-1">
                    Expires {formatDateTime(link.expires_at)}
                  </div>
                </li>
              ))}
              {activeResetLinks.length === 0 ? (
                <li className="li-meta">No active recovery emails.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        ok
          ? "bg-success-container text-success"
          : "bg-status-waiting-container text-status-waiting"
      }`}
    >
      {label}
    </span>
  );
}

function SmallPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        ok
          ? "border-success/20 bg-success-container/30 text-success"
          : "border-border-hairline bg-surface-container-low text-on-surface-variant"
      }`}
    >
      {label}
    </span>
  );
}

function SmallTag({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
