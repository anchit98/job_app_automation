import { PaymentReviewClient } from "@/components/billing/payment-review-client";
import { getPaymentClaimForReview } from "@/lib/billing/payment-claims";
import { verifyPaymentReviewToken } from "@/lib/billing/payment-review-token";
import { env } from "@/lib/env";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function ReviewPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);
  const verified = await verifyPaymentReviewToken(token);

  if (!verified) {
    return (
      <ReviewShell>
        <div className="li-card mx-auto max-w-md p-6 text-center space-y-3">
          <h1 className="text-[20px] font-semibold text-on-surface">
            Link expired or invalid
          </h1>
          <p className="text-[14px] text-on-surface-variant">
            Request a new payment claim notification, or open Admin Center on
            desktop to review pending claims.
          </p>
        </div>
      </ReviewShell>
    );
  }

  const claim = await getPaymentClaimForReview(verified.claimId);
  if (!claim) {
    return (
      <ReviewShell>
        <div className="li-card mx-auto max-w-md p-6 text-center space-y-3">
          <h1 className="text-[20px] font-semibold text-on-surface">
            Claim not found
          </h1>
          <p className="text-[14px] text-on-surface-variant">
            This payment claim may have been removed.
          </p>
        </div>
      </ReviewShell>
    );
  }

  return (
    <ReviewShell>
      <PaymentReviewClient
        token={token}
        claim={{
          id: claim.id,
          upi_reference: claim.upi_reference,
          note: claim.note,
          status: claim.status,
          created_at: claim.created_at,
          email: claim.email ?? "",
          full_name: claim.full_name ?? null,
          amountInr: env.paymentAmountInr(),
          planLabel: env.paymentPlanLabel(),
        }}
      />
    </ReviewShell>
  );
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-canvas">
      <div className="absolute top-3 right-3 z-10">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
