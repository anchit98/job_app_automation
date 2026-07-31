import { redirect } from "next/navigation";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";
import { getLatestPaymentClaim } from "@/lib/billing/payment-claims";
import { env } from "@/lib/env";
import { PaymentClaimForm } from "@/components/billing/payment-claim-form";
import { CopyUpiButton } from "@/components/billing/copy-upi-button";
import { ShowUpiQrButton } from "@/components/billing/show-upi-qr-button";

const includedFeatures = [
  { icon: "all_inclusive", label: "Lifetime access" },
  { icon: "confirmation_number", label: "60 applications included" },
  { icon: "account_tree", label: "Full Apply pipeline" },
  { icon: "support_agent", label: "One-time setup support" },
];

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
      {/* Offer hero */}
      <section className="bp-hero overflow-hidden rounded-2xl px-5 pb-6 pt-7 text-center sm:px-8">
        <div className="bp-hero-grid" aria-hidden />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-surface px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            Launch offer · first 100 buyers
          </p>
          <h1 className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-on-surface sm:text-[24px]">
            Activate JobApp OS
          </h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">{planLabel}</p>
          <p className="bp-price mt-3 text-[56px] font-bold leading-none">
            ₹{amount}
          </p>
          <p className="mt-2 text-[13px] text-on-surface-variant">
            Lifetime access. 60 applications included.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {includedFeatures.map((feature) => (
              <span key={feature.label} className="bp-chip">
                <span className="material-symbols-outlined" aria-hidden>
                  check_circle
                </span>
                {feature.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Step 1 — pay */}
      <section className="li-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="bp-step-badge">1</span>
          <div className="min-w-0">
            <h2 className="li-section-title">Pay ₹{amount} with UPI</h2>
            <p className="li-meta mt-0.5">
              Scan the QR or pay directly to the UPI ID below.
            </p>
          </div>
        </div>

        {upiId ? (
          <>
            <code className="bp-upi-code">{upiId}</code>
            <div className="mobile-action-row md:flex md:flex-wrap md:items-center">
              <CopyUpiButton upiId={upiId} />
              <ShowUpiQrButton
                upiId={upiId}
                amountInr={amount}
                planLabel={planLabel}
              />
            </div>
            <a
              href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("JobApp OS")}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent(planLabel)}`}
              className="li-btn-primary inline-flex w-full justify-center gap-2 text-[13px] no-underline"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden>
                currency_rupee
              </span>
              Open UPI app
            </a>
            <p className="li-meta leading-relaxed">
              Works with GPay, PhonePe, Paytm, and every other UPI app. Use your
              account email ({user.email}) in the payment note if asked.
            </p>
          </>
        ) : (
          <p className="li-meta">
            UPI payment is not configured yet. Ask the admin to set the UPI ID.
          </p>
        )}
      </section>

      {/* Step 2 — confirm */}
      <section className="li-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="bp-step-badge">2</span>
          <div className="min-w-0">
            <h2 className="li-section-title">Submit your payment reference</h2>
            <p className="li-meta mt-0.5">
              Paste the UTR / transaction ID from your UPI app.
            </p>
          </div>
        </div>
        <PaymentClaimForm hasPendingClaim={hasPending} />
      </section>

      {/* What happens next */}
      <section className="li-card-flat flex items-start gap-3 p-4">
        <span
          className="material-symbols-outlined mt-0.5 text-[20px] text-primary"
          aria-hidden
        >
          verified_user
        </span>
        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          An admin verifies your transfer and unlocks your account — usually
          within a few hours. You&apos;ll land straight on your dashboard the
          next time you sign in.
        </p>
      </section>
    </div>
  );
}
