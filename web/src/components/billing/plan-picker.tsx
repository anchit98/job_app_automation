"use client";

/**
 * The plans and top-ups anyone can buy.
 *
 * Both the ladder and the credit packs live here rather than in two components
 * because they answer one question — "how do I get more Apply runs?" — and the
 * right answer depends on which you already have.
 *
 * Everything renders from `lib/billing/pricing`, the same catalogue the
 * landing page reads, so the two cannot drift apart. Nothing here decides what
 * anything costs.
 */
import { useState, useTransition } from "react";
import { startRazorpayPaymentLink } from "@/app/actions/billing";
import {
  PRICING_PLANS,
  PRICING_TOPUPS,
  formatInr,
  type EntitlementPlan,
  type PricingPlan,
} from "@/lib/billing/pricing";

export function PlanPicker({
  currentPlan,
  applyCreditsLeft,
  unlimited,
  razorpayReady,
}: {
  currentPlan: EntitlementPlan;
  applyCreditsLeft: number;
  /** legacy_lifetime — credits are not counted for these accounts. */
  unlimited: boolean;
  razorpayReady: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buy(kind: "plan" | "topup", code: string) {
    if (!razorpayReady) {
      setError("Online payment is temporarily unavailable. Try again later.");
      return;
    }
    setError(null);
    setBusyCode(code);
    startTransition(async () => {
      // On success the action redirects to Razorpay and never returns.
      const result = await startRazorpayPaymentLink({ kind, code });
      if (result && !result.ok) setError(result.error);
      setBusyCode(null);
    });
  }

  return (
    <div className="space-y-6">
      <section className="li-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="li-section-title">Your plan</h2>
          <span className="li-meta">
            {unlimited
              ? "Lifetime access — Apply runs are not counted"
              : `${applyCreditsLeft} Apply ${applyCreditsLeft === 1 ? "run" : "runs"} left`}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          {unlimited
            ? "You bought the original lifetime offer, so none of the limits below apply to you."
            : "The CV Builder, AI tailoring, the tracker and follow-ups are unlimited on every plan. Apply runs are the metered part."}
        </p>
      </section>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-error-container/40 px-3 py-2.5 text-[13px] text-error">
          <span className="material-symbols-outlined mt-px text-[16px]" aria-hidden>
            error
          </span>
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            isCurrent={!unlimited && currentPlan === plan.code}
            disabled={unlimited || pending}
            busy={busyCode === plan.code}
            onBuy={() => buy("plan", plan.code)}
          />
        ))}
      </section>

      <section className="li-card p-4 space-y-3">
        <div>
          <h2 className="li-section-title">Add Apply runs</h2>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            Out of runs but happy where you are? A top-up adds runs without
            changing your plan. Runs never expire.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRICING_TOPUPS.map((pack) => (
            <div
              key={pack.code}
              className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-on-surface">
                  {pack.name}
                </p>
                <p className="li-meta">{formatInr(pack.priceInr)}</p>
              </div>
              <button
                type="button"
                disabled={unlimited || pending}
                onClick={() => buy("topup", pack.code)}
                className="li-btn-secondary shrink-0 text-[13px] disabled:opacity-50"
              >
                {busyCode === pack.code ? "Opening…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  disabled,
  busy,
  onBuy,
}: {
  plan: PricingPlan;
  isCurrent: boolean;
  disabled: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const isFree = plan.priceInr <= 0;
  return (
    <div
      className={`li-card flex flex-col gap-3 p-4 ${
        plan.highlighted ? "border-primary" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="li-section-title">{plan.name}</h3>
          {isCurrent ? (
            <span className="li-chip bg-secondary-container text-on-secondary-container">
              Current
            </span>
          ) : plan.highlighted ? (
            <span className="li-chip bg-primary-container text-on-primary-container">
              Popular
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[28px] font-bold leading-none text-on-surface">
          {formatInr(plan.priceInr)}
        </p>
        <p className="li-meta mt-1">{plan.tagline}</p>
      </div>

      <ul className="flex-1 space-y-1.5">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-1.5 text-[13px] text-on-surface-variant"
          >
            <span
              className="material-symbols-outlined mt-px text-[16px] text-[var(--success)]"
              aria-hidden
            >
              check
            </span>
            {feature}
          </li>
        ))}
      </ul>

      {isFree ? (
        <p className="li-meta text-center">
          {isCurrent ? "You are on this plan" : "Included with every account"}
        </p>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onBuy}
          className={`${
            plan.highlighted ? "li-btn-primary" : "li-btn-secondary"
          } w-full justify-center disabled:opacity-50`}
        >
          {busy ? "Opening…" : isCurrent ? "Buy more runs" : `Get ${plan.name}`}
        </button>
      )}
    </div>
  );
}
