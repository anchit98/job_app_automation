"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPaymentClaim } from "@/app/actions/billing";

export function PaymentClaimForm({
  hasPendingClaim,
}: {
  hasPendingClaim: boolean;
}) {
  const router = useRouter();
  const [upiReference, setUpiReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hasPendingClaim) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-status-waiting/30 bg-status-waiting-container px-4 py-3.5">
        <span
          className="material-symbols-outlined mt-0.5 text-[20px] text-status-waiting"
          aria-hidden
        >
          hourglass_top
        </span>
        <div>
          <p className="text-[14px] font-semibold text-on-surface">
            Payment submitted — awaiting approval
          </p>
          <p className="li-meta mt-1 leading-relaxed">
            We&apos;ll unlock your account after verifying the UPI transfer. You
            can close this page and check back later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await submitPaymentClaim({
            upi_reference: upiReference,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setMessage(
            result.emailNotified
              ? "Payment details submitted for review. Admins have been emailed."
              : result.emailError
                ? `Payment submitted, but the admin email failed: ${result.emailError}`
                : "Payment details submitted for review.",
          );
          setUpiReference("");
          router.refresh();
        });
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-[13px] font-semibold text-on-surface">
          UPI / UTR reference
        </span>
        <div className="relative">
          <span
            className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-on-surface-variant"
            aria-hidden
          >
            receipt_long
          </span>
          <input
            required
            value={upiReference}
            onChange={(e) => setUpiReference(e.target.value)}
            placeholder="e.g. 412345678901"
            className="w-full min-h-11 rounded-lg border border-border-hairline bg-surface py-2.5 pl-10 pr-3 text-[14px] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="li-meta">
          Copy the transaction ID from your UPI app after paying.
        </span>
      </label>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-error-container/40 px-3 py-2.5 text-[13px] text-error">
          <span className="material-symbols-outlined mt-px text-[16px]" aria-hidden>
            error
          </span>
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="flex items-start gap-2 rounded-lg bg-success-container/40 px-3 py-2.5 text-[13px] text-on-surface">
          <span
            className="material-symbols-outlined mt-px text-[16px] text-success"
            aria-hidden
          >
            check_circle
          </span>
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="li-btn-primary w-full justify-center gap-2 disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          task_alt
        </span>
        {pending ? "Submitting…" : "I've paid — submit for approval"}
      </button>
    </form>
  );
}
