"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewPaymentClaimViaEmailToken } from "@/app/actions/payment-review";

export type PaymentReviewClaimView = {
  id: string;
  upi_reference: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  email: string;
  full_name: string | null;
  amountInr: string;
  planLabel: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PaymentReviewClient({
  token,
  claim,
}: {
  token: string;
  claim: PaymentReviewClaimView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(claim.status);

  const who = claim.full_name?.trim()
    ? `${claim.full_name.trim()}`
    : claim.email;

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await reviewPaymentClaimViaEmailToken({ token, decision });
      if (!result.ok) {
        setError(result.error);
        if (result.status) setStatus(result.status);
        return;
      }
      setStatus(result.status);
      router.refresh();
    });
  }

  const isPending = status === "pending";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jobapp-os-logo.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-xl bg-surface p-1 shadow-[var(--shadow-card)]"
        />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            JobApp OS
          </p>
          <h1 className="text-[20px] font-semibold text-on-surface leading-tight">
            Payment review
          </h1>
        </div>
      </header>

      <section className="li-card flex-1 space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="li-meta">Amount</p>
            <p className="mt-1 text-[32px] font-semibold leading-none text-on-surface">
              ₹{claim.amountInr}
            </p>
            <p className="mt-2 text-[13px] text-on-surface-variant">
              {claim.planLabel}
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <dl className="space-y-3 rounded-xl bg-surface-container-low p-4 text-[14px]">
          <div>
            <dt className="li-meta">Payer</dt>
            <dd className="mt-0.5 font-semibold text-on-surface">{who}</dd>
            {claim.full_name?.trim() ? (
              <dd className="text-[13px] text-on-surface-variant">
                {claim.email}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="li-meta">UTR / UPI reference</dt>
            <dd className="mt-0.5 break-all font-mono text-[15px] font-semibold text-primary">
              {claim.upi_reference}
            </dd>
          </div>
          <div>
            <dt className="li-meta">Submitted</dt>
            <dd className="mt-0.5 text-on-surface">
              {formatWhen(claim.created_at)}
            </dd>
          </div>
          {claim.note?.trim() ? (
            <div>
              <dt className="li-meta">Note</dt>
              <dd className="mt-0.5 text-on-surface">{claim.note.trim()}</dd>
            </div>
          ) : null}
        </dl>

        {isPending ? (
          <p className="text-[13px] leading-snug text-on-surface-variant">
            Verify the transfer in your UPI app, then approve or reject below.
          </p>
        ) : status === "approved" ? (
          <p className="rounded-lg bg-success-container px-3 py-2.5 text-[13px] font-medium text-on-success-container">
            Access unlocked for this user.
          </p>
        ) : (
          <p className="rounded-lg bg-error-container px-3 py-2.5 text-[13px] font-medium text-on-error-container">
            Claim rejected. The user can submit a new payment reference.
          </p>
        )}

        {error ? (
          <p className="rounded-lg bg-error-container px-3 py-2.5 text-[13px] text-on-error-container">
            {error}
          </p>
        ) : null}
      </section>

      {isPending ? (
        <div className="sticky bottom-0 mt-4 grid grid-cols-2 gap-3 bg-canvas/90 pt-3 backdrop-blur-sm">
          <button
            type="button"
            disabled={pending}
            className="min-h-14 rounded-xl border border-error/30 bg-error-container text-[16px] font-semibold text-on-error-container disabled:opacity-60"
            onClick={() => decide("rejected")}
          >
            {pending ? "…" : "Reject"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="min-h-14 rounded-xl bg-success text-[16px] font-semibold text-white disabled:opacity-60"
            onClick={() => decide("approved")}
          >
            {pending ? "…" : "Approve"}
          </button>
        </div>
      ) : (
        <p className="mt-6 text-center text-[12px] text-on-surface-variant">
          You can close this page.
        </p>
      )}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const label =
    status === "pending"
      ? "Pending"
      : status === "approved"
        ? "Approved"
        : "Rejected";
  const className =
    status === "pending"
      ? "bg-status-waiting-container text-status-waiting"
      : status === "approved"
        ? "bg-success-container text-on-success-container"
        : "bg-error-container text-on-error-container";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
