import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";
import { getLatestPaymentClaim } from "@/lib/billing/payment-claims";
import { env } from "@/lib/env";
import { PaymentClaimForm } from "@/components/billing/payment-claim-form";
import { CopyUpiButton } from "@/components/billing/copy-upi-button";
import { ShowUpiQrButton } from "@/components/billing/show-upi-qr-button";
import { signOut } from "@/app/actions/auth";

export default async function BillingPage() {
  const user = await requireUser();
  if (userHasPaidAccess(user)) {
    redirect("/dashboard");
  }

  const claim = await getLatestPaymentClaim(user.id);
  const upiId = env.upiId();
  const amount = env.paymentAmountInr();
  const planLabel = env.paymentPlanLabel();
  const hasPending = claim?.status === "pending";

  return (
    <div className="mx-auto max-w-xl space-y-4 py-1 sm:py-2">
      <div>
        <h1 className="li-page-title">Activate JobApp OS</h1>
        <p className="text-[14px] text-on-surface-variant mt-1 leading-relaxed">
          Pay via UPI ID or QR, then submit your transaction reference. An admin
          will unlock your account after verifying the payment.
        </p>
      </div>

      <section className="li-card p-4 sm:p-5 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="li-meta">Plan</p>
            <h2 className="li-section-title mt-0.5 truncate">{planLabel}</h2>
          </div>
          <p className="text-[28px] font-semibold text-on-surface leading-none tabular-nums shrink-0">
            ₹{amount}
          </p>
        </div>

        <div className="rounded-lg border border-border-hairline bg-surface-container-low p-4 space-y-3">
          <p className="text-[13px] font-semibold text-on-surface">
            1. Pay with UPI
          </p>
          {upiId ? (
            <>
              <code className="block w-full rounded-md bg-surface px-3 py-3 text-center text-[15px] font-semibold text-primary border border-border-hairline break-all">
                {upiId}
              </code>
              <div className="mobile-action-row md:flex md:flex-wrap md:items-center">
                <CopyUpiButton upiId={upiId} />
                <ShowUpiQrButton amountInr={amount} planLabel={planLabel} />
              </div>
              <p className="li-meta leading-relaxed">
                Pay ₹{amount} with any UPI app using the UPI ID, or tap Show QR
                and scan. Use your account email ({user.email}) in the payment
                note if asked.
              </p>
              <a
                href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("JobApp OS")}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent(planLabel)}`}
                className="li-btn-primary inline-flex no-underline justify-center text-[13px] w-full"
              >
                Open UPI app
              </a>
            </>
          ) : (
            <div className="space-y-3">
              <ShowUpiQrButton amountInr={amount} planLabel={planLabel} />
              <p className="li-meta">
                Tap Show QR and scan with any UPI app to pay ₹{amount}.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-on-surface">
            2. Submit payment reference
          </p>
          <PaymentClaimForm hasPendingClaim={hasPending} />
        </div>
      </section>

      <div className="mobile-meta-row text-[13px]">
        <Link
          href="/settings"
          className="text-primary font-semibold hover:underline no-underline"
        >
          Privacy &amp; Settings
        </Link>
        <form action={signOut}>
          <button type="submit" className="li-btn-ghost text-[13px] w-auto">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
