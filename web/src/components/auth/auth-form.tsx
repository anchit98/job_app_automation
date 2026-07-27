"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signIn, signUp } from "@/app/actions/auth";

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "signup";
  nextPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
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
        router.replace(
          result.user?.must_reset_password
            ? "/reset-password-required"
            : nextPath || "/dashboard",
        );
        router.refresh();
      } catch {
        setError(
          "Sign-in failed. If this is production, confirm AUTH_SECRET is set on Vercel and redeploy.",
        );
      }
    });
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <Link href="/" className="inline-flex items-center gap-2 no-underline">
          <Image
            src="/brand/jobapp-os-logo.png"
            alt="JobApp OS"
            width={102}
            height={60}
            className="h-[60px] w-auto"
            priority
            unoptimized
          />
          <span className="text-[24px] font-semibold text-primary">JobApp OS</span>
        </Link>
        <h1 className="text-[24px] font-semibold text-on-surface">
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-[14px] text-on-surface-variant">
          {mode === "signup"
            ? "Start automating tailored applications."
            : "Welcome back — continue your job pipeline."}
        </p>
      </div>

      <form onSubmit={submit} className="li-card p-6 space-y-4">
        {mode === "signup" && (
          <label className="block space-y-1.5">
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
        <label className="block space-y-1.5">
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
          disabled={pending}
          className="li-btn-primary w-full justify-center disabled:opacity-50"
        >
          {pending
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="text-center text-[14px] text-on-surface-variant">
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
