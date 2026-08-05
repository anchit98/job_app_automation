import { redirect } from "next/navigation";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";
import { env, hasRazorpayConfig } from "@/lib/env";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { RazorpayPayButton } from "@/components/billing/razorpay-pay-button";

const includedFeatures = [
  { label: "60 applications" },
  { label: "Full Apply pipeline" },
  { label: "Setup support" },
];

const trustPoints = [
  {
    icon: "lock",
    title: "Secure checkout",
    detail: "Payments are processed by Razorpay. We never see your card or UPI details.",
  },
  {
    icon: "bolt",
    title: "Instant activation",
    detail: "Your account unlocks automatically within moments of a successful payment.",
  },
  {
    icon: "receipt_long",
    title: "One-time payment",
    detail: "No subscriptions, auto-renewals, or hidden charges — pay once, keep access.",
  },
];

export default async function BillingPage() {
  const user = await requireUser();
  if (userHasPaidAccess(user)) {
    const readiness = await getSetupReadiness().catch(() => null);
    redirect(readiness?.setupReady ? "/dashboard" : "/onboarding");
  }

  const amount = env.paymentAmountInr();
  const planLabel = env.paymentPlanLabel();
  const razorpayReady = hasRazorpayConfig();

  return (
    <>
      {/* Ambient animated background spanning the whole main area */}
      <div className="bp-ambient" aria-hidden>
        <span className="bp-orb bp-orb--1" />
        <span className="bp-orb bp-orb--2" />
        <span className="bp-orb bp-orb--3" />
        <span className="bp-ring bp-ring--1" />
        <span className="bp-ring bp-ring--2" />
        <span className="bp-float-dot bp-float-dot--1" />
        <span className="bp-float-dot bp-float-dot--2" />
        <span className="bp-float-dot bp-float-dot--3" />
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-xl flex-1 flex-col justify-center pb-6 md:pb-10">
      <section className="bp-hero bp-rise overflow-hidden rounded-2xl px-5 pb-6 pt-6 text-center sm:px-8 sm:pb-7 sm:pt-7">
        <div className="bp-hero-grid" aria-hidden />

        {/* Floating decorative icons */}
        <span
          className="bp-spark material-symbols-outlined left-5 top-16 text-[22px] sm:left-8"
          aria-hidden
        >
          workspace_premium
        </span>
        <span
          className="bp-spark bp-spark--slow material-symbols-outlined right-5 top-24 hidden text-[20px] sm:right-9 sm:block"
          aria-hidden
        >
          rocket_launch
        </span>

        <div className="relative">
          <p className="bp-rise inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Launch offer · first 100 buyers
          </p>
          <h1 className="bp-rise bp-d1 mt-3 text-[21px] font-semibold leading-tight tracking-[-0.01em] text-on-surface sm:text-[24px]">
            Activate JobApp OS
          </h1>
          <p className="bp-rise bp-d1 mt-1 text-[13px] text-on-surface-variant">
            {planLabel}
          </p>
          <p className="bp-price bp-price-animated bp-rise bp-d2 mt-2 text-[48px] font-bold leading-none sm:text-[54px]">
            ₹{amount}
          </p>
          <p className="bp-rise bp-d2 mt-1.5 text-[12px] text-on-surface-variant">
            Lifetime access. 60 applications included.
          </p>
          <div className="bp-rise bp-d3 mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {includedFeatures.map((feature) => (
              <span key={feature.label} className="bp-chip">
                <span className="material-symbols-outlined" aria-hidden>
                  check_circle
                </span>
                {feature.label}
              </span>
            ))}
          </div>

          {razorpayReady ? (
            <RazorpayPayButton
              amountInr={amount}
              className="bp-rise bp-d4 mx-auto mt-5 max-w-sm space-y-2"
            />
          ) : null}
        </div>
      </section>

      {/* Trust strip between the offer card and the footer */}
      <div className="relative grid shrink-0 gap-2 pb-2 pt-3 sm:grid-cols-3">
        {trustPoints.map((point, i) => (
          <div
            key={point.title}
            className={`li-card-flat bp-trust bp-rise bp-d${4 + i} flex items-start gap-2.5 p-3 text-left`}
          >
            <span className="bp-trust-icon" aria-hidden>
              <span className="material-symbols-outlined text-[17px]">
                {point.icon}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-on-surface">
                {point.title}
              </p>
              <p className="li-meta mt-0.5 text-[11px] leading-snug">
                {point.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
