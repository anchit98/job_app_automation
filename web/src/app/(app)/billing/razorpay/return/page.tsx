import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  requireUser,
  setUserPaid,
  userHasPaidAccess,
} from "@/lib/auth/user";
import { verifyPaymentLinkCallbackSignature } from "@/lib/billing/razorpay";
import {
  getRazorpayPaymentLinkByRazorpayId,
  markRazorpayPaymentLinkPaid,
} from "@/lib/billing/razorpay-payment-links";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { PaymentReturnPoller } from "@/components/billing/payment-return-poller";

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function revalidateAfterPaid() {
  revalidatePath("/billing");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export default async function RazorpayReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  let paid = userHasPaidAccess(user);

  // Optional fast path: verify the Razorpay callback signature and unlock
  // immediately. The webhook remains the source of truth either way.
  if (!paid) {
    const params = await searchParams;
    const paymentId = param(params.razorpay_payment_id);
    const paymentLinkId = param(params.razorpay_payment_link_id);
    const referenceId = param(params.razorpay_payment_link_reference_id);
    const linkStatus = param(params.razorpay_payment_link_status);
    const signature = param(params.razorpay_signature);

    if (paymentId && paymentLinkId && signature && linkStatus === "paid") {
      const verified = verifyPaymentLinkCallbackSignature({
        paymentLinkId,
        paymentId,
        paymentLinkReferenceId: referenceId,
        paymentLinkStatus: linkStatus,
        signature,
      });

      if (verified) {
        const link = await getRazorpayPaymentLinkByRazorpayId(paymentLinkId);
        if (link && link.user_id === user.id) {
          if (link.status !== "paid") {
            await markRazorpayPaymentLinkPaid(paymentLinkId, paymentId);
          }
          await setUserPaid(user.id, true);
          await writeAuditLog(
            "payment.razorpay_link_paid_return",
            "razorpay_payment_links",
            link.id,
            {
              razorpay_payment_link_id: paymentLinkId,
              razorpay_payment_id: paymentId,
              via: "callback_signature",
            },
          );
          revalidateAfterPaid();
          paid = true;
        }
      }
    }
  }

  if (paid) {
    const readiness = await getSetupReadiness().catch(() => null);
    redirect(readiness?.setupReady ? "/dashboard" : "/onboarding");
  }

  // Not confirmed yet (likely webhook lag) — show a soft confirming state
  // that refreshes itself; the page redirects as soon as the webhook lands.
  return (
    <div className="relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-6 md:pb-10">
      <PaymentReturnPoller />
    </div>
  );
}
