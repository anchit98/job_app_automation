"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reconcileRazorpayPaymentReturn } from "@/app/actions/billing";

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 12;

/**
 * Shown while we wait for payment confirmation.
 * Polls Razorpay via a server action (not only webhook lag).
 */
export function PaymentReturnPoller({
  paymentLinkId,
  referenceId,
}: {
  paymentLinkId?: string;
  referenceId?: string;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (attemptsRef.current >= MAX_ATTEMPTS) return;
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);

      const result = await reconcileRazorpayPaymentReturn({
        paymentLinkId,
        referenceId,
      });
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.paid) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      router.refresh();
    }

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [paymentLinkId, referenceId, router]);

  const stillWaiting = attempts >= MAX_ATTEMPTS;

  return (
    <section className="bp-hero bp-rise overflow-hidden rounded-2xl px-5 pb-6 pt-6 text-center sm:px-8 sm:pb-7 sm:pt-7">
      <div className="bp-hero-grid" aria-hidden />
      <div className="relative">
        {stillWaiting ? (
          <>
            <span
              className="material-symbols-outlined text-[40px] text-status-waiting"
              aria-hidden
            >
              hourglass_top
            </span>
            <h1 className="mt-3 text-[19px] font-semibold text-on-surface">
              Payment is taking a moment
            </h1>
            <p className="li-meta mx-auto mt-2 max-w-xs leading-relaxed">
              We haven&apos;t received the confirmation yet. If you completed
              the payment, your account will unlock automatically — you can
              check back in a minute.
            </p>
            {error ? (
              <p className="mt-2 text-[12px] text-error">{error}</p>
            ) : null}
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  attemptsRef.current = 0;
                  setAttempts(0);
                  setError(null);
                  void reconcileRazorpayPaymentReturn({
                    paymentLinkId,
                    referenceId,
                  }).then((result) => {
                    if (result.ok && result.paid) {
                      router.replace("/onboarding");
                      router.refresh();
                      return;
                    }
                    router.refresh();
                  });
                }}
                className="li-btn-primary bp-cta w-full max-w-xs justify-center gap-2"
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  aria-hidden
                >
                  refresh
                </span>
                Check again
              </button>
              <Link
                href="/billing"
                className="text-[13px] font-semibold text-on-surface-variant no-underline hover:text-on-surface hover:underline"
              >
                Back to billing
              </Link>
            </div>
          </>
        ) : (
          <>
            <span
              className="material-symbols-outlined inline-block animate-spin text-[40px] text-primary"
              aria-hidden
            >
              progress_activity
            </span>
            <h1 className="mt-3 text-[19px] font-semibold text-on-surface">
              Confirming your payment…
            </h1>
            <p className="li-meta mx-auto mt-2 max-w-xs leading-relaxed">
              Hang tight — this usually takes just a few seconds. You&apos;ll
              be taken to setup automatically once it&apos;s confirmed.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
