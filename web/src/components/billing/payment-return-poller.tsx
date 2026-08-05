"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 10;

/**
 * Shown while we wait for the Razorpay webhook to confirm the payment.
 * Refreshes the server page on an interval; the page redirects once paid.
 */
export function PaymentReturnPoller() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        clearInterval(timer);
        return;
      }
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

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
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  attemptsRef.current = 0;
                  setAttempts(0);
                  router.refresh();
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
