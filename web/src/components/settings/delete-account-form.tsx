"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteMyAccount } from "@/app/actions/auth";

export function DeleteAccountForm({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
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
    setPassword("");
    setConfirmEmail("");
    setError(null);
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
      <div className="li-card p-4 border border-error/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="li-section-title text-error">Delete account</h2>
            <p className="li-meta mt-1">
              Permanently removes your profile, applications, pipelines, and
              stored Google tokens from JobApp OS. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-error/40 bg-error-container/30 px-3 py-2 text-[13px] font-semibold text-error hover:bg-error-container/60 transition-colors"
            onClick={openModal}
          >
            Delete account
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
            aria-labelledby="delete-account-title"
            className="li-card w-full max-w-md p-5 space-y-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-account-title" className="li-section-title text-error">
                  Delete your account?
                </h2>
                <p className="li-meta mt-1">
                  All applications, resumes, cover letters, and session data
                  will be permanently deleted.
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
                startTransition(async () => {
                  const result = await deleteMyAccount({
                    password,
                    confirmEmail,
                  });
                  if (!result.ok) {
                    setError(result.error);
                  }
                });
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-on-surface">
                  Type your email to confirm
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder={userEmail}
                  className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-on-surface">
                  Password
                </span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
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
                  className="flex-1 justify-center rounded-lg border border-error bg-error px-4 py-2 text-[14px] font-semibold text-on-error hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
