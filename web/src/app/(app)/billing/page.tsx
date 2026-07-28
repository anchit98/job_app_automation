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
    <div className="mx-auto max-w-xl space-y-4 py-2">
      <div>
        <h1 className="li-page-title">Activate JobApp OS</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Pay via UPI ID or QR, then submit your transaction reference. An admin
          will unlock your account after verifying the payment.
        </p>

      </div>

      <section className="li-card p-5 space-y-4">
        <div>
          <p className="li-meta">Plan</p>
          <h2 className="li-section-title mt-0.5">{planLabel}</h2>
          <p className="mt-2 text-[28px] font-semibold text-on-surface leading-none">
            ₹{amount}
          </p>
        </div>

        <div className="rounded-lg border border-border-hairline bg-surface-container-low p-4 space-y-3">
          <p className="text-[13px] font-semibold text-on-surface">
            1. Pay with UPI
          </p>
          {upiId ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface px-3 py-2 text-[15px] font-semibold text-primary border border-border-hairline">
                  {upiId}
                </code>
                <CopyUpiButton upiId={upiId} />
                <ShowUpiQrButton amountInr={amount} planLabel={planLabel} />
              </div>
              <p className="li-meta">
                Pay ₹{amount} with any UPI app using the UPI ID, or tap Show QR and
                scan. Use your account email ({user.email}) in the payment note if
                asked.
              </p>
              <a
                href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("JobApp OS")}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent(planLabel)}`}
                className="li-btn-primary inline-flex no-underline justify-center text-[13px]"
              >
                Open UPI app
              </a>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ShowUpiQrButton amountInr={amount} planLabel={planLabel} />
              </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <Link
          href="/settings"
          className="text-primary font-semibold hover:underline no-underline"
        >
          Privacy &amp; Settings
        </Link>
        <form action={signOut}>
          <button type="submit" className="li-btn-ghost text-[13px]">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
