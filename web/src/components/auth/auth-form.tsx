"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signIn, signUp } from "@/app/actions/auth";

function resolveClientRedirect(
  result: {
    redirectTo?: string;
    user?: {
      must_reset_password?: boolean;
      is_paid?: boolean;
      is_admin?: boolean;
    };
  },
  nextPath: string,
): string {
  // Prefer server-chosen landing (setup-aware). Only override for Razorpay return.
  const next = nextPath || "/dashboard";
  if (next.startsWith("/billing/razorpay/return")) return next;
  if (result.redirectTo) return result.redirectTo;
  if (result.user?.must_reset_password) return "/reset-password-required";
  if (
    result.user &&
    result.user.is_paid === false &&
    !result.user.is_admin
  ) {
    return "/billing";
  }
  return next;
}

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "signup";
  nextPath: string;
}) {
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = pending || navigating;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    startTransition(async () => {
      try {
        const result =
          mode === "signup"
            ? await signUp({ email, password, full_name: fullName })
            : await signIn({ email, password });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Full document navigation — soft App Router transitions from the
        // auth layout into /(app) + setup redirect often paint a blank
        // onboarding until a hard refresh. Stay disabled until it completes
        // so a second click can't re-run the action mid-navigation.
        setNavigating(true);
        window.location.assign(resolveClientRedirect(result, nextPath));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        // Stale client after a deploy often fails Server Actions with opaque
        // digests — a hard reload picks up the matching action IDs.
        if (/Failed to find Server Action|server action|fetch|network|digest/i.test(msg)) {
          setError(
            "Sign-in interrupted (often after a fresh deploy). Refresh this page and try again.",
          );
          return;
        }
        console.error("[auth-form]", err);
        setError(
          msg && msg.length < 180
            ? msg
            : "Sign-in failed. Refresh the page and try again.",
        );
      }
    });
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-[22px] font-semibold text-on-surface">
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-[13px] text-on-surface-variant">
          {mode === "signup"
            ? "Start automating tailored applications."
            : "Welcome back. Continue your job pipeline."}
        </p>
      </div>

      <form onSubmit={submit} className="li-card space-y-3 p-5">
        {mode === "signup" && (
          <label className="block space-y-1">
            <span className="text-[13px] font-semibold text-on-surface">Full name</span>
            <input
              className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
        )}
        <label className="block space-y-1">
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
        <label className="block space-y-1">
          <span className="text-[13px] font-semibold text-on-surface">Password</span>
          <input
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {mode === "signup" && (
            <span className="text-[12px] text-on-surface-variant">
              At least 8 characters. Email verification comes later.
            </span>
          )}
        </label>

        {error && (
          <p className="text-[13px] text-error bg-error-container/40 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="li-btn-primary w-full justify-center disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="text-center text-[13px] text-on-surface-variant">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-semibold">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-primary font-semibold">
              Create an account
            </Link>
            <span className="mx-2 text-on-surface-variant">·</span>
            <Link href="/forgot-password" className="text-primary font-semibold">
              Forgot password?
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
