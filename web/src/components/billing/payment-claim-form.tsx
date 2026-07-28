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
      <div className="rounded-lg border border-status-waiting/30 bg-status-waiting-container px-4 py-3">
        <p className="text-[14px] font-semibold text-on-surface">
          Payment submitted — awaiting admin approval
        </p>
        <p className="li-meta mt-1">
          We&apos;ll unlock your account after verifying the UPI transfer. You can
          close this page and check back later.
        </p>
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
        <input
          required
          value={upiReference}
          onChange={(e) => setUpiReference(e.target.value)}
          placeholder="e.g. 412345678901"
          className="w-full rounded-md border border-border-hairline bg-surface px-3 py-2 text-[14px]"
        />
        <span className="li-meta">
          Copy the transaction ID from your UPI app after paying.
        </span>
      </label>
      {error ? (
        <p className="rounded-md bg-error-container/40 px-3 py-2 text-[13px] text-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md bg-success-container/40 px-3 py-2 text-[13px] text-on-surface">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="li-btn-primary w-full justify-center disabled:opacity-50"
      >
        {pending ? "Submitting…" : "I've paid — submit for approval"}
      </button>
    </form>
  );
}
