"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { startRazorpayPaymentLink } from "@/app/actions/billing";

export function RazorpayPayButton({
  amountInr,
  className,
}: {
  amountInr: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={className ?? "space-y-2"}>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-error-container/40 px-3 py-2.5 text-left text-[13px] text-error">
          <span
            className="material-symbols-outlined mt-px text-[16px]"
            aria-hidden
          >
            error
          </span>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        className="li-btn-primary bp-cta w-full justify-center gap-2 disabled:opacity-50"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await startRazorpayPaymentLink();
            if (result && !result.ok) {
              setError(result.error);
            }
          });
        }}
      >
        <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/80">
          <Image
            src="/billing/razorpay-logo.png"
            alt=""
            width={24}
            height={24}
            className="h-full w-full object-cover"
            unoptimized
          />
        </span>
        {pending ? "Redirecting…" : "Pay securely via Razorpay"}
        <span className="sr-only">₹{amountInr}</span>
      </button>
    </div>
  );
}
