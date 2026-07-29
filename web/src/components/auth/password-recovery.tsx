"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changePasswordAfterFirstLogin,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/app/actions/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-[24px] font-semibold text-on-surface">Forgot password</h1>
        <p className="text-[14px] text-on-surface-variant">
          We&apos;ll email you a secure link to reset your password.
        </p>
      </div>
      <form
        className="li-card p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await requestPasswordReset({ email });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(result.message);
          });
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-on-surface">Email</span>
          <input
            type="email"
            required
            className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
        <button
          type="submit"
          disabled={pending}
          className="li-btn-primary w-full justify-center disabled:opacity-50"
        >
          Send reset email
        </button>
      </form>
      <p className="text-center text-[14px] text-on-surface-variant">
        Remembered it?{" "}
        <Link href="/login" className="text-primary font-semibold">
          Back to sign in
        </Link>
        <span className="mx-2 text-on-surface-variant">·</span>
        <Link href="/" className="text-primary font-semibold">
          Home
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({
  token,
  forced = false,
}: {
  token?: string;
  forced?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-[24px] font-semibold text-on-surface">
          {forced ? "Change your password" : "Reset password"}
        </h1>
        <p className="text-[14px] text-on-surface-variant">
          {forced
            ? "Your account was created or reset by an admin. Set a new password to continue."
            : "Choose a new password for your account."}
        </p>
      </div>
      <form
        className="li-card p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
          }
          startTransition(async () => {
            const result = forced
              ? await changePasswordAfterFirstLogin({ password })
              : await resetPasswordWithToken({ token: token || "", password });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace("/dashboard");
            router.refresh();
          });
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-on-surface">New password</span>
          <input
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-on-surface">
            Confirm password
          </span>
          <input
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error ? (
          <p className="rounded-md bg-error-container/40 px-3 py-2 text-[13px] text-error">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="li-btn-primary w-full justify-center disabled:opacity-50"
        >
          Save new password
        </button>
      </form>
      {!forced ? (
        <p className="text-center text-[14px] text-on-surface-variant">
          <Link href="/login" className="text-primary font-semibold">
            Back to sign in
          </Link>
          <span className="mx-2 text-on-surface-variant">·</span>
          <Link href="/" className="text-primary font-semibold">
            Home
          </Link>
        </p>
      ) : null}
    </div>
  );
}
