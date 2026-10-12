import Link from "next/link";
import { getEntitlements, isUnlimited } from "@/lib/billing/entitlements";
import { PRICING_PLANS } from "@/lib/billing/pricing";

/**
 * How many Apply runs are left.
 *
 * Metering used to be invisible: an account either had paid for everything or
 * could not open the app at all, so there was nothing to count. Now every
 * account starts on the free plan with a handful of runs, and finding that out
 * when the Apply button refuses is too late — the number belongs somewhere you
 * pass on the way in.
 *
 * Says nothing at all for `legacy_lifetime` accounts, which are unmetered:
 * a counter implies a ceiling, and they do not have one.
 */
export async function ApplyCreditsCard() {
  const entitlements = await getEntitlements();
  if (isUnlimited(entitlements.plan, "apply")) return null;

  const left = entitlements.apply_credits;
  const planName =
    PRICING_PLANS.find((p) => p.code === entitlements.plan)?.name ?? "Free";
  const low = left <= 1;

  return (
    <div
      className={`li-card-flat flex flex-wrap items-center justify-between gap-3 p-4 ${
        low ? "border-l-4 border-l-status-waiting" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-on-surface">
          {left === 0
            ? "No Apply runs left"
            : `${left} Apply ${left === 1 ? "run" : "runs"} left`}
          <span className="li-meta ml-2 font-normal">{planName} plan</span>
        </p>
        <p className="li-meta mt-0.5">
          {left === 0
            ? "Top up to keep applying. The CV Builder and tailoring stay free."
            : "One run is a full tailored application. The CV Builder and tailoring are unlimited."}
        </p>
      </div>
      <Link
        href="/billing"
        className={`${low ? "li-btn-primary" : "li-btn-secondary"} shrink-0 text-[13px] no-underline`}
      >
        {left === 0 ? "Get more runs" : "View plans"}
      </Link>
    </div>
  );
}
