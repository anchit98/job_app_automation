import { redirect } from "next/navigation";
import {
  getCurrentUser,
  userHasPaidAccess,
} from "@/lib/auth/user";
import { verifyPaymentLinkCallbackSignature } from "@/lib/billing/razorpay";
import {
  getRazorpayPaymentLinkByRazorpayId,
  getRazorpayPaymentLinkByReferenceId,
} from "@/lib/billing/razorpay-payment-links";
import {
  reconcilePaidPaymentLink,
  unlockFromPaymentLinkRow,
} from "@/lib/billing/razorpay-unlock";
import { PaymentReturnPoller } from "@/components/billing/payment-return-poller";

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function buildReturnPath(
  params: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const key of [
    "razorpay_payment_id",
    "razorpay_payment_link_id",
    "razorpay_payment_link_reference_id",
    "razorpay_payment_link_status",
    "razorpay_signature",
  ]) {
    const value = param(params[key]);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query
    ? `/billing/razorpay/return?${query}`
    : "/billing/razorpay/return";
}

export default async function RazorpayReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const paymentId = param(params.razorpay_payment_id);
  const paymentLinkId = param(params.razorpay_payment_link_id);
  const referenceId = param(params.razorpay_payment_link_reference_id);
  const linkStatus = param(params.razorpay_payment_link_status);
  const signature = param(params.razorpay_signature);

  let unlockedUserId: string | null = null;

  // Fast path: verify callback signature and unlock even if session was lost
  // during the Razorpay redirect (common cause of “back to login” + unpaid).
  if (paymentId && paymentLinkId && signature && linkStatus === "paid") {
    const verified = verifyPaymentLinkCallbackSignature({
      paymentLinkId,
      paymentId,
      paymentLinkReferenceId: referenceId,
      paymentLinkStatus: linkStatus,
      signature,
    });

    if (verified) {
      const link =
        (await getRazorpayPaymentLinkByRazorpayId(paymentLinkId)) ||
        (referenceId
          ? await getRazorpayPaymentLinkByReferenceId(referenceId)
          : null);
      if (link) {
        await unlockFromPaymentLinkRow(
          link,
          paymentId,
          "callback_signature",
        );
        unlockedUserId = link.user_id;
      } else {
        const result = await reconcilePaidPaymentLink({
          paymentLinkId,
          referenceId,
          via: "callback_signature_reconcile",
        });
        if (result.unlocked) unlockedUserId = result.userId;
      }
    }
  }

  // Webhook lag / signature missing: confirm against Razorpay API.
  if (!unlockedUserId && paymentLinkId) {
    const user = await getCurrentUser();
    const result = await reconcilePaidPaymentLink({
      paymentLinkId,
      referenceId,
      expectedUserId: user?.id,
      via: "return_api_reconcile",
    });
    if (result.unlocked) unlockedUserId = result.userId;
  }

  const user = await getCurrentUser();
  if (!user) {
    // Preserve Razorpay query params through login so unlock can finish.
    const next = encodeURIComponent(buildReturnPath(params));
    redirect(
      unlockedUserId
        ? `/login?next=${encodeURIComponent("/onboarding")}&paid=1`
        : `/login?next=${next}`,
    );
  }

  const paid =
    Boolean(unlockedUserId && unlockedUserId === user.id) ||
    userHasPaidAccess(user);

  if (paid) {
    // Product rule: always land on onboarding after a successful payment.
    redirect("/onboarding");
  }

  if (!paymentLinkId && !referenceId) {
    redirect("/billing");
  }

  return (
    <div className="relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-6 md:pb-10">
      <PaymentReturnPoller
        paymentLinkId={paymentLinkId || undefined}
        referenceId={referenceId || undefined}
      />
    </div>
  );
}
