"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { PASSWORD_AUTH_ENABLED } from "@/lib/auth/password-auth";

/** Google's brand mark, inline — no external asset, no network request. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

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

/**
 * Why a Google sign-in round trip came back empty-handed.
 *
 * Google's own `error` values pass through as themselves (`access_denied`),
 * so anything not named here is shown as a generic failure rather than as a
 * raw machine string.
 */
const OAUTH_ERRORS: Record<string, string> = {
  not_configured:
    "Google sign-in is not configured on this deployment. Use your email and password.",
  access_denied: "You cancelled the Google sign-in.",
  missing_code: "Google did not complete the sign-in. Try again.",
  invalid_state:
    "That sign-in link expired or was opened in a different browser. Try again.",
  exchange_failed: "Google rejected the sign-in. Try again in a moment.",
  email_unverified:
    "An account already uses this email, and Google has not verified the address. Sign in with your password instead.",
  account_missing: "The account could not be loaded. Try again.",
  signin_failed: "Sign-in failed. Try again in a moment.",
};

export function AuthForm({
  mode,
  nextPath,
  oauthError,
}: {
  mode: "login" | "signup";
  nextPath: string;
  /** `oauth_error` from a failed "Continue with Google" round trip. */
  oauthError?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError
      ? (OAUTH_ERRORS[oauthError] ?? "Google sign-in failed. Try again.")
      : null,
  );
  const busy = pending || navigating;

  function continueWithGoogle() {
    setError(null);
    setNavigating(true);
    // A full navigation, not fetch: the OAuth round trip has to happen in the
    // address bar for Google to show its account chooser.
    window.location.assign(
      `/api/auth/oauth/google/start?next=${encodeURIComponent(nextPath || "/dashboard")}`,
    );
  }

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

      <div className="li-card space-y-3 p-5">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={busy}
          className="li-btn-secondary w-full justify-center disabled:opacity-50"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <p className="text-center text-[12px] text-on-surface-variant">
          {mode === "signup"
            ? "No password to choose, and nothing else is requested — Drive access is asked for later, only if you use Apply."
            : "Uses your Google account for sign-in only."}
        </p>
      </div>

      {PASSWORD_AUTH_ENABLED ? (
        <>
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border-hairline" />
        <span className="text-[12px] font-semibold text-on-surface-variant">
          or
        </span>
        <span className="h-px flex-1 bg-border-hairline" />
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
        </>
      ) : null}

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
            {/* Nothing to reset while the credential path is off. */}
            {PASSWORD_AUTH_ENABLED ? (
              <>
                <span className="mx-2 text-on-surface-variant">·</span>
                <Link href="/forgot-password" className="text-primary font-semibold">
                  Forgot password?
                </Link>
              </>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
