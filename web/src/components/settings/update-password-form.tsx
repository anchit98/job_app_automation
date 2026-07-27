"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updatePassword } from "@/app/actions/auth";

export function UpdatePasswordForm() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  }

  function closeModal() {
    setOpen(false);
    resetFields();
  }

  function openModal() {
    resetFields();
    setOpen(true);
  }

  return (
    <>
      <div className="li-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="li-section-title">Password</h2>
            <p className="li-meta mt-1">
              Change the password used to sign in to JobApp OS.
            </p>
          </div>
          <button
            type="button"
            className="li-btn-secondary text-[13px] justify-center"
            onClick={openModal}
          >
            Change password
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="li-card w-full max-w-md p-5 space-y-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="change-password-title"
                  className="li-section-title"
                >
                  Update password
                </h2>
                <p className="li-meta mt-1">
                  Enter your current password, then choose a new one.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface"
                onClick={closeModal}
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setMessage(null);
                if (newPassword !== confirmPassword) {
                  setError("New passwords do not match.");
                  return;
                }
                startTransition(async () => {
                  const result = await updatePassword({
                    currentPassword,
                    newPassword,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setMessage("Password updated.");
                  window.setTimeout(() => closeModal(), 700);
                });
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-on-surface">
                  Current password
                </span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  autoFocus
                  className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-on-surface">
                  New password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-on-surface">
                  Confirm new password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
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
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="li-btn-ghost flex-1 justify-center"
                  onClick={closeModal}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="li-btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {pending ? "Updating…" : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
