"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminApprovePaymentClaim,
  adminCreateUser,
  adminDeleteUser,
  adminRejectPaymentClaim,
  adminResetUserPassword,
  adminSetUserAdmin,
  adminSetUserPaid,
} from "@/app/actions/admin";
import type { AdminUserSummary } from "@/lib/admin/queries";
import type { PaymentClaim } from "@/lib/billing/payment-claims";

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
  pendingPaymentClaims,
}: {
  currentUserId: string;
  users: AdminUserSummary[];
  resetRequests: ResetRequest[];
  activeResetLinks: ActiveResetLink[];
  pendingPaymentClaims: PaymentClaim[];
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
    <div className="flex flex-col gap-3 min-h-[calc(100vh-56px-5rem)]">
      <section className="li-card p-4 space-y-3 shrink-0">
        <div>
          <h2 className="li-section-title">Add user</h2>
          <p className="li-meta mt-0.5">
            Default password <code>abc12345</code> · forced reset on first login ·
            unpaid until approved
          </p>
        </div>
        <form
          className="grid grid-cols-1 md:grid-cols-3 gap-2"
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

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
        <div className="li-card p-3 space-y-2 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-on-surface">
              Pending UPI payments
            </h2>
            <span className="li-meta">{pendingPaymentClaims.length}</span>
          </div>
          {pendingPaymentClaims.length === 0 ? (
            <p className="li-meta">None pending.</p>
          ) : (
            <ul className="space-y-2 max-h-36 overflow-y-auto">
              {pendingPaymentClaims.map((claim) => (
                <li
                  key={claim.id}
                  className="rounded-md border border-border-hairline px-2.5 py-2 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-on-surface truncate">
                      {claim.full_name || claim.email}
                    </p>
                    <p className="li-meta truncate">
                      UTR <code className="text-primary">{claim.upi_reference}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconBtn
                      title="Approve & unlock"
                      icon="check_circle"
                      disabled={pending}
                      tone="primary"
                      onClick={() => {
                        clearFeedback();
                        startTransition(async () => {
                          const result = await adminApprovePaymentClaim({
                            claimId: claim.id,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setMessage(`Approved payment for ${claim.email}.`);
                          router.refresh();
                        });
                      }}
                    />
                    <IconBtn
                      title="Reject"
                      icon="cancel"
                      disabled={pending}
                      tone="danger"
                      onClick={() => {
                        clearFeedback();
                        startTransition(async () => {
                          const result = await adminRejectPaymentClaim({
                            claimId: claim.id,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setMessage(`Rejected payment for ${claim.email}.`);
                          router.refresh();
                        });
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="li-card p-3 space-y-2">
          <h2 className="text-[14px] font-semibold text-on-surface">
            Password recovery
          </h2>
          <p className="li-meta">
            Forgot-password and admin resets email a one-time link. Validate on
            the reset page before a new password is set.
          </p>
          <p className="li-meta">
            Open recovery requests:{" "}
            <strong className="text-on-surface">{resetRequests.length}</strong>
          </p>
        </div>

        <div className="li-card p-3 space-y-2 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-on-surface">
              Active recovery emails
            </h2>
            <span className="li-meta">{activeResetLinks.length}</span>
          </div>
          {activeResetLinks.length === 0 ? (
            <p className="li-meta">No active links.</p>
          ) : (
            <ul className="space-y-1.5 max-h-36 overflow-y-auto">
              {activeResetLinks.map((link) => (
                <li
                  key={link.id}
                  className="rounded-md border border-border-hairline px-2.5 py-1.5"
                >
                  <p className="text-[12px] font-semibold text-on-surface truncate">
                    {link.full_name || link.email}
                  </p>
                  <p className="li-meta">
                    {link.kind === "forgot_password" ? "Forgot password" : "Admin sent"}{" "}
                    · expires {formatDateTime(link.expires_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="li-card overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border-muted px-4 py-2.5 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h2 className="li-section-title">Users</h2>
            <p className="li-meta">
              Hover action icons for labels. Default password after reset:{" "}
              <code>abc12345</code>
            </p>
          </div>
          <span className="li-meta shrink-0">{users.length} total</span>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface-container-low text-on-surface-variant sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Setup</th>
                <th className="px-3 py-2 font-semibold">Flags</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {users.map((user) => (
                <tr key={user.id} className="align-middle hover:bg-[var(--ghost-hover)]">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-on-surface leading-tight">
                      {user.full_name || "Unnamed user"}
                      {user.id === currentUserId ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-primary">
                          (you)
                        </span>
                      ) : null}
                    </div>
                    <div className="li-meta truncate max-w-[220px]">{user.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusPill
                        ok={user.setup_completed}
                        label={user.setup_completed ? "Done" : "Pending"}
                      />
                      <SetupDot ok={user.console_done} title="Console" />
                      <SetupDot ok={user.google_connected} title="Google" />
                      <SetupDot ok={user.profile_done} title="Profile" />
                      <SetupDot ok={user.extension_configured} title="Bridge" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.is_admin ? <SmallTag label="Admin" /> : null}
                      <SmallTag label={user.is_paid ? "Paid" : "Unpaid"} />
                      {user.must_reset_password ? (
                        <SmallTag label="Must reset" />
                      ) : null}
                      {pendingRequestUsers.has(user.id) ? (
                        <SmallTag label="Recovery" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-0.5">
                      {!user.is_paid ? (
                        <IconBtn
                          title="Mark paid"
                          icon="paid"
                          disabled={pending}
                          tone="primary"
                          onClick={() => {
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminSetUserPaid({
                                userId: user.id,
                                paid: true,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Marked ${user.email} as paid.`);
                              router.refresh();
                            });
                          }}
                        />
                      ) : !user.is_admin ? (
                        <IconBtn
                          title="Revoke access"
                          icon="lock"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Revoke paid access for ${user.email}?`,
                              )
                            ) {
                              return;
                            }
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminSetUserPaid({
                                userId: user.id,
                                paid: false,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Revoked access for ${user.email}.`);
                              router.refresh();
                            });
                          }}
                        />
                      ) : null}

                      {!user.is_admin ? (
                        <IconBtn
                          title="Make admin"
                          icon="admin_panel_settings"
                          disabled={pending}
                          tone="primary"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Promote ${user.email} to admin? They will get full Admin Center access.`,
                              )
                            ) {
                              return;
                            }
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminSetUserAdmin({
                                userId: user.id,
                                isAdmin: true,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Promoted ${user.email} to admin.`);
                              router.refresh();
                            });
                          }}
                        />
                      ) : user.id !== currentUserId ? (
                        <IconBtn
                          title="Remove admin"
                          icon="person_off"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove admin role from ${user.email}?`,
                              )
                            ) {
                              return;
                            }
                            clearFeedback();
                            startTransition(async () => {
                              const result = await adminSetUserAdmin({
                                userId: user.id,
                                isAdmin: false,
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Removed admin from ${user.email}.`);
                              router.refresh();
                            });
                          }}
                        />
                      ) : null}

                      <IconBtn
                        title="Reset password to default"
                        icon="password"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Reset password for ${user.email} to default (abc12345)? They must change it on next login.`,
                            )
                          ) {
                            return;
                          }
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
                              `Password reset for ${user.email}. Default: ${result.defaultPassword}`,
                            );
                            router.refresh();
                          });
                        }}
                      />

                      <IconBtn
                        title="Delete account"
                        icon="delete"
                        disabled={pending || user.id === currentUserId}
                        tone="danger"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Permanently delete ${user.email}? All data will be removed.`,
                            )
                          ) {
                            return;
                          }
                          clearFeedback();
                          startTransition(async () => {
                            const result = await adminDeleteUser({
                              userId: user.id,
                            });
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            setMessage(`Deleted ${result.email}.`);
                            router.refresh();
                          });
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 li-meta">
                    No users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function IconBtn({
  title,
  icon,
  onClick,
  disabled,
  tone = "default",
}: {
  title: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary hover:bg-primary-container"
      : tone === "danger"
        ? "text-error hover:bg-error-container/50"
        : "text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${toneClass}`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok
          ? "bg-success-container text-success"
          : "bg-status-waiting-container text-status-waiting"
      }`}
    >
      {label}
    </span>
  );
}

function SetupDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-success" : "bg-border-hairline"
      }`}
    />
  );
}

function SmallTag({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
      {label}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
