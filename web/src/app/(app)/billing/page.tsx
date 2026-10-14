import { requireUser } from "@/lib/auth/user";
import { hasRazorpayConfig } from "@/lib/env";
import { getEntitlements, isUnlimited } from "@/lib/billing/entitlements";
import { PlanPicker } from "@/components/billing/plan-picker";

/**
 * Plans and top-ups.
 *
 * This used to be a paywall — the one screen an unpaid account could reach,
 * with a single ₹299 offer on it. There is no paywall any more: everyone gets
 * the free plan and a handful of Apply runs, so this is a page you visit when
 * you want more, not a door you are held behind. Hence no redirect either
 * way: a paid user has just as much reason to open it as a free one.
 */
export default async function BillingPage() {
  const user = await requireUser();
  const entitlements = await getEntitlements(user.id);
  const unlimited = isUnlimited(entitlements.plan, "apply");

  return (
    <>
      {/* Ambient animated background spanning the whole main area */}
      <div className="bp-ambient" aria-hidden>
        <span className="bp-orb bp-orb--1" />
        <span className="bp-orb bp-orb--2" />
        <span className="bp-orb bp-orb--3" />
        <span className="bp-ring bp-ring--1" />
        <span className="bp-ring bp-ring--2" />
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-5xl space-y-4 pb-10">
        <div>
          <h1 className="li-page-title">Plans &amp; credits</h1>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            One Apply run is one tailored application: resume, cover letter,
            contacts and the outreach emails. Everything else is unlimited.
          </p>
        </div>

        <PlanPicker
          currentPlan={entitlements.plan}
          applyCreditsLeft={entitlements.apply_credits}
          unlimited={unlimited}
          razorpayReady={hasRazorpayConfig()}
        />

        <div className="grid gap-2 sm:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <div
              key={point.title}
              className="li-card-flat flex items-start gap-2.5 p-3 text-left"
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

const TRUST_POINTS = [
  {
    icon: "lock",
    title: "Secure checkout",
    detail:
      "Payments are processed by Razorpay. We never see your card or UPI details.",
  },
  {
    icon: "bolt",
    title: "Instant activation",
    detail: "Credits land on your account moments after a successful payment.",
  },
  {
    icon: "receipt_long",
    title: "No subscription",
    detail:
      "Every purchase is one-time. Nothing auto-renews, and credits never expire.",
  },
];
