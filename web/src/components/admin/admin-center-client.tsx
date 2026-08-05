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
import { formatAppDateTime } from "@/lib/datetime/india";
import type { PaymentClaim } from "@/lib/billing/payment-claims";
import type { RazorpayPaymentLinkAdminRow } from "@/lib/billing/razorpay-payment-links";

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
  recentRazorpayPaymentLinks,
}: {
  currentUserId: string;
  users: AdminUserSummary[];
  resetRequests: ResetRequest[];
  activeResetLinks: ActiveResetLink[];
  pendingPaymentClaims: PaymentClaim[];
  recentRazorpayPaymentLinks: RazorpayPaymentLinkAdminRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createForm, setCreateForm] = useState({ email: "", full_name: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const pendingRequestUsers = useMemo(
    () => new Set(resetRequests.map((request) => request.user_id)),
    [resetRequests],
  );

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 md:min-h-[calc(100vh-56px-5rem)]">
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
            className="rounded-md border border-border-hairline bg-surface px-3 py-2.5 text-[14px] min-h-11"
            placeholder="Full name"
            value={createForm.full_name}
            onChange={(e) =>
              setCreateForm((current) => ({ ...current, full_name: e.target.value }))
            }
          />
          <input
            type="email"
            className="rounded-md border border-border-hairline bg-surface px-3 py-2.5 text-[14px] min-h-11"
            placeholder="Email"
            value={createForm.email}
            onChange={(e) =>
              setCreateForm((current) => ({ ...current, email: e.target.value }))
            }
          />
          <button
            type="submit"
            disabled={pending}
            className="li-btn-primary justify-center disabled:opacity-50 w-full md:w-auto"
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
        <div className="li-card p-3 space-y-2 min-h-0 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-on-surface">
              Recent Razorpay links
            </h2>
            <span className="li-meta">{recentRazorpayPaymentLinks.length}</span>
          </div>
          {recentRazorpayPaymentLinks.length === 0 ? (
            <p className="li-meta">No payment links yet.</p>
          ) : (
            <ul className="space-y-2 max-h-44 overflow-y-auto">
              {recentRazorpayPaymentLinks.map((link) => (
                <li
                  key={link.id}
                  className="rounded-md border border-border-hairline px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-on-surface truncate">
                        {link.full_name || link.email}
                      </p>
                      <p className="li-meta truncate">
                        ₹{(link.amount_paise / 100).toFixed(0)} ·{" "}
                        {link.reference_id || link.razorpay_payment_link_id}
                      </p>
                      <p className="li-meta">
                        {formatAppDateTime(link.created_at)}
                        {link.paid_at
                          ? ` · paid ${formatAppDateTime(link.paid_at)}`
                          : ""}
                      </p>
                    </div>
                    <PaymentLinkStatusBadge status={link.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <details
            className="group border-t border-border-hairline pt-2"
            open={pendingPaymentClaims.length > 0}
          >
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-on-surface-variant outline-none marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5">
                Manual UPI claims (legacy)
                <span className="li-meta font-normal">
                  {pendingPaymentClaims.length} pending
                </span>
                <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">
                  expand_more
                </span>
              </span>
            </summary>
            <div className="mt-2 space-y-2">
              {pendingPaymentClaims.length === 0 ? (
                <p className="li-meta">None pending.</p>
              ) : (
                <ul className="space-y-2 max-h-36 overflow-y-auto">
                  {pendingPaymentClaims.map((claim) => (
                    <li
                      key={claim.id}
                      className="rounded-md border border-border-hairline px-2.5 py-2.5 flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-on-surface truncate">
                          {claim.full_name || claim.email}
                        </p>
                        <p className="li-meta truncate">
                          UTR{" "}
                          <code className="text-primary">
                            {claim.upi_reference}
                          </code>
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
          </details>
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
              Open the ⋮ menu for user actions. Default password after reset:{" "}
              <code>abc12345</code>
            </p>
          </div>
          <span className="li-meta shrink-0">{users.length} total</span>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface-container-low text-on-surface-variant sticky top-0 z-10">
              <tr>
                <th className="px-2 sm:px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold hidden sm:table-cell w-[11rem]">
                  Setup
                </th>
                <th className="px-1.5 sm:px-3 py-2 font-semibold">Flags</th>
                <th
                  className="px-1.5 sm:px-3 py-2 font-semibold text-center sm:text-right w-8 sm:w-[4.5rem]"
                  title="Applications whose latest pipeline completed"
                >
                  <span className="sr-only">Passed</span>
                  <span
                    aria-hidden
                    className="mx-auto inline-block h-2.5 w-2.5 rounded-full bg-success sm:hidden"
                  />
                  <span className="hidden sm:inline">Passed</span>
                </th>
                <th
                  className="px-1.5 sm:px-3 py-2 font-semibold text-center sm:text-right w-8 sm:w-[4.5rem]"
                  title="Applications whose latest pipeline failed or needs manual"
                >
                  <span className="sr-only">Failed</span>
                  <span
                    aria-hidden
                    className="mx-auto inline-block h-2.5 w-2.5 rounded-full bg-error sm:hidden"
                  />
                  <span className="hidden sm:inline">Failed</span>
                </th>
                <th className="px-1 sm:px-3 py-2 font-semibold text-right w-10 sm:w-12">
                  <span className="absolute h-px w-px overflow-hidden whitespace-nowrap p-0 [clip:rect(0,0,0,0)]">
                    Actions
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {users.map((user) => (
                <tr key={user.id} className="align-middle hover:bg-[var(--ghost-hover)]">
                  <td className="px-2 sm:px-3 py-2 min-w-0">
                    <div className="font-semibold text-on-surface leading-tight">
                      {user.full_name || "Unnamed user"}
                      {user.id === currentUserId ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-primary">
                          (you)
                        </span>
                      ) : null}
                    </div>
                    <div className="li-meta truncate">{user.email}</div>
                    <div className="mt-1 flex items-center gap-2 sm:hidden">
                      <StatusPill
                        ok={user.setup_completed}
                        label={user.setup_completed ? "Done" : "Pending"}
                      />
                      <SetupDots
                        google={user.google_connected}
                        profile={user.profile_done}
                        resume={user.resume_done}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <StatusPill
                        ok={user.setup_completed}
                        label={user.setup_completed ? "Done" : "Pending"}
                      />
                      <SetupDots
                        google={user.google_connected}
                        profile={user.profile_done}
                        resume={user.resume_done}
                      />
                    </div>
                  </td>
                  <td className="px-1.5 sm:px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {user.is_admin ? <SmallTag label="Admin" /> : null}
                      <PaidTag paid={user.is_paid} />
                      {user.must_reset_password ? (
                        <SmallTag label="Must reset" />
                      ) : null}
                      {pendingRequestUsers.has(user.id) ? (
                        <SmallTag label="Recovery" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-1.5 sm:px-3 py-2 text-center sm:text-right tabular-nums text-on-surface">
                    {user.apps_passed}
                  </td>
                  <td
                    className={`px-1.5 sm:px-3 py-2 text-center sm:text-right tabular-nums ${
                      user.apps_failed > 0 ? "text-error" : "text-on-surface"
                    }`}
                  >
                    {user.apps_failed}
                  </td>
                  <td className="px-1 sm:px-2 py-2 text-right align-middle">
                    <UserActionsMenu
                      open={openMenuUserId === user.id}
                      onOpenChange={(next) =>
                        setOpenMenuUserId(next ? user.id : null)
                      }
                      disabled={pending}
                      items={[
                        !user.is_paid
                          ? {
                              id: "mark-paid",
                              label: "Mark paid",
                              icon: "paid",
                              tone: "primary" as const,
                              onSelect: () => {
                                setOpenMenuUserId(null);
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
                              },
                            }
                          : !user.is_admin
                            ? {
                                id: "revoke",
                                label: "Revoke access",
                                icon: "lock",
                                onSelect: () => {
                                  if (
                                    !window.confirm(
                                      `Revoke paid access for ${user.email}?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  setOpenMenuUserId(null);
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
                                    setMessage(
                                      `Revoked access for ${user.email}.`,
                                    );
                                    router.refresh();
                                  });
                                },
                              }
                            : null,
                        !user.is_admin
                          ? {
                              id: "make-admin",
                              label: "Make admin",
                              icon: "admin_panel_settings",
                              tone: "primary" as const,
                              onSelect: () => {
                                if (
                                  !window.confirm(
                                    `Promote ${user.email} to admin? They will get full Admin Center access.`,
                                  )
                                ) {
                                  return;
                                }
                                setOpenMenuUserId(null);
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
                                  setMessage(
                                    `Promoted ${user.email} to admin.`,
                                  );
                                  router.refresh();
                                });
                              },
                            }
                          : user.id !== currentUserId
                            ? {
                                id: "remove-admin",
                                label: "Remove admin",
                                icon: "person_off",
                                onSelect: () => {
                                  if (
                                    !window.confirm(
                                      `Remove admin role from ${user.email}?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  setOpenMenuUserId(null);
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
                                    setMessage(
                                      `Removed admin from ${user.email}.`,
                                    );
                                    router.refresh();
                                  });
                                },
                              }
                            : null,
                        {
                          id: "reset-password",
                          label: "Reset password",
                          icon: "password",
                          onSelect: () => {
                            if (
                              !window.confirm(
                                `Reset password for ${user.email} to default (abc12345)? They must change it on next login.`,
                              )
                            ) {
                              return;
                            }
                            setOpenMenuUserId(null);
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
                          },
                        },
                        {
                          id: "delete",
                          label: "Delete account",
                          icon: "delete",
                          tone: "danger" as const,
                          disabled: user.id === currentUserId,
                          onSelect: () => {
                            if (
                              !window.confirm(
                                `Permanently delete ${user.email}? All data will be removed.`,
                              )
                            ) {
                              return;
                            }
                            setOpenMenuUserId(null);
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
                          },
                        },
                      ].filter(Boolean) as UserActionItem[]}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 li-meta">
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

type UserActionItem = {
  id: string;
  label: string;
  icon: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
};

function UserActionsMenu({
  open,
  onOpenChange,
  items,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UserActionItem[];
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex justify-end">
      <button
        type="button"
        title="Actions"
        aria-label="User actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[22px]">more_vert</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close actions menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+4px)] z-30 w-[220px] overflow-hidden rounded-lg border border-border-hairline bg-surface py-1 shadow-[var(--shadow-card)]"
          >
            {items.map((item) => {
              const toneClass =
                item.tone === "primary"
                  ? "text-primary"
                  : item.tone === "danger"
                    ? "text-error"
                    : "text-on-surface";
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={disabled || item.disabled}
                  onClick={item.onSelect}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium hover:bg-[var(--ghost-hover)] disabled:opacity-40 ${toneClass}`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
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
      className={`inline-flex w-[4.25rem] shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ok
          ? "bg-success-container text-success"
          : "bg-status-waiting-container text-status-waiting"
      }`}
    >
      {label}
    </span>
  );
}

function SetupDots({
  google,
  profile,
  resume,
}: {
  google: boolean;
  profile: boolean;
  resume: boolean;
}) {
  return (
    <span
      className="inline-grid grid-cols-3 gap-1.5 items-center shrink-0"
      aria-label={`Setup: Google ${google ? "done" : "pending"}, Profile ${profile ? "done" : "pending"}, Resume ${resume ? "done" : "pending"}`}
    >
      <SetupDot ok={google} title="Google connected" />
      <SetupDot ok={profile} title="Profile saved" />
      <SetupDot ok={resume} title="Master resume synced" />
    </span>
  );
}

function SetupDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`inline-block h-2.5 w-2.5 rounded-full justify-self-center ${
        ok ? "bg-success" : "bg-border-hairline"
      }`}
    />
  );
}

function PaidTag({ paid }: { paid: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        paid
          ? "bg-success-container text-success"
          : "bg-error-container text-error"
      }`}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function SmallTag({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
      {label}
    </span>
  );
}

function PaymentLinkStatusBadge({
  status,
}: {
  status: RazorpayPaymentLinkAdminRow["status"];
}) {
  const tone =
    status === "paid"
      ? "border-success/30 bg-success-container/40 text-success"
      : status === "created"
        ? "border-status-waiting/30 bg-status-waiting-container text-status-waiting"
        : "border-border-hairline bg-surface-container-low text-on-surface-variant";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${tone}`}
    >
      {status}
    </span>
  );
}

function formatDateTime(value: string) {
  return formatAppDateTime(value);
}
