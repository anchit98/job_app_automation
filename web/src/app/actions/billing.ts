"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  createPaymentClaim,
  getOpenPaymentClaim,
} from "@/lib/billing/payment-claims";
import { notifyAdminsOfPaymentClaim } from "@/lib/billing/payment-claim-email";
import { createPaymentLink } from "@/lib/billing/razorpay";
import {
  getLatestOpenRazorpayPaymentLinkForUser,
  insertRazorpayPaymentLink,
} from "@/lib/billing/razorpay-payment-links";
import { resolvePurchase } from "@/lib/billing/pricing";
import { reconcilePaidPaymentLink } from "@/lib/billing/razorpay-unlock";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";
import { env, hasRazorpayConfig } from "@/lib/env";
import { headers } from "next/headers";

const claimSchema = z.object({
  upi_reference: z
    .string()
    .trim()
    .min(4, "Enter the UPI / UTR reference from your payment.")
    .max(64, "Reference is too long."),
  note: z.string().trim().max(500).optional(),
});

export async function submitPaymentClaim(input: {
  upi_reference: string;
  note?: string;
}) {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const user = await requireUser();
    if (userHasPaidAccess(user)) {
      return { ok: false as const, error: "Your account already has access." };
    }

    const open = await getOpenPaymentClaim(user.id);
    if (open) {
      return {
        ok: false as const,
        error:
          "You already have a payment pending review. An admin will unlock access after verifying the UPI transfer.",
      };
    }

    const claim = await createPaymentClaim({
      userId: user.id,
      upiReference: parsed.data.upi_reference,
      note: parsed.data.note,
    });
    await writeAuditLog("payment.claim_submitted", "payment_claims", claim.id, {
      upi_reference: claim.upi_reference,
    });

    const notify = await notifyAdminsOfPaymentClaim({
      claimId: claim.id,
      payerEmail: user.email,
      payerName: user.full_name,
      upiReference: claim.upi_reference,
    });
    if (notify.ok) {
      await writeAuditLog("payment.claim_email_sent", "payment_claims", claim.id, {
        emailed_to: notify.emailedTo,
      });
    } else {
      console.error("[billing] payment claim email failed:", notify.error);
      await writeAuditLog("payment.claim_email_failed", "payment_claims", claim.id, {
        error: notify.error,
      });
    }

    revalidatePath("/billing");
    revalidatePath("/admin-center");
    return {
      ok: true as const,
      claimId: claim.id,
      emailNotified: notify.ok,
      emailError: notify.ok ? undefined : notify.error,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/** Razorpay `reference_id` max length is 40. */
function buildPaymentLinkReferenceId(userId: string): string {
  const userPart = userId.replace(/-/g, "").slice(0, 8);
  const randPart = randomUUID().replace(/-/g, "").slice(0, 12);
  return `jap_${userPart}_${randPart}`;
}

/**
 * Create a Razorpay Payment Link for the current user and redirect to the
 * hosted page. On failure returns `{ ok: false, error }` for the billing UI.
 *
 * `purchase` names what is being bought — a plan code or a top-up code from
 * lib/billing/pricing. It is written onto the link row so the webhook can
 * grant the right thing without re-deriving it from the amount, which would
 * break the moment two products cost the same.
 *
 * It is required. Nothing sells the old ₹299 lifetime offer any more — the
 * unlock path still understands links that predate the ladder (they carry no
 * purchase columns), but no new one is ever created.
 */
export async function startRazorpayPaymentLink(purchase: {
  kind: string;
  code: string;
}): Promise<{ ok: false; error: string } | never> {
  let shortUrl: string;

  try {
    const user = await requireUser();
    if (!hasRazorpayConfig()) {
      return {
        ok: false as const,
        error: "Online payment is temporarily unavailable. Try again later.",
      };
    }

    const resolved = resolvePurchase(purchase.kind, purchase.code);
    if (!resolved) {
      return { ok: false as const, error: "That plan is no longer available." };
    }

    // Tiers and top-ups are repeat purchases by design — running out of Apply
    // runs and buying more is the normal case — so there is nothing to refuse
    // an existing customer here.
    const amountPaise = Math.round(resolved.priceInr * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return { ok: false as const, error: "Invalid payment amount configuration." };
    }

    const referenceId = buildPaymentLinkReferenceId(user.id);
    const headerStore = await headers();
    const appUrl = env.publicAppUrlFromHeaders(headerStore);
    const callbackUrl = `${appUrl}/billing/razorpay/return`;

    const link = await createPaymentLink({
      amountPaise,
      referenceId,
      userId: user.id,
      callbackUrl,
      description: resolved.label,
      customer: {
        name: user.full_name ?? undefined,
        email: user.email,
      },
    });

    const row = await insertRazorpayPaymentLink({
      userId: user.id,
      razorpayPaymentLinkId: link.id,
      amountPaise: link.amountPaise,
      currency: link.currency,
      shortUrl: link.shortUrl,
      referenceId: link.referenceId,
      purchaseKind: resolved.kind,
      purchaseCode: resolved.code,
    });

    await writeAuditLog(
      "payment.razorpay_link_created",
      "razorpay_payment_links",
      row.id,
      {
        razorpay_payment_link_id: link.id,
        reference_id: link.referenceId,
        amount_paise: link.amountPaise,
        purchase_kind: resolved.kind,
        purchase_code: resolved.code,
      },
    );

    revalidatePath("/billing");
    shortUrl = link.shortUrl;
  } catch (error) {
    console.error("[billing] startRazorpayPaymentLink failed:", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }

  redirect(shortUrl);
}

/**
 * Called from the payment return poller — confirms paid status via Razorpay API
 * when the webhook has not unlocked the account yet.
 */
export async function reconcileRazorpayPaymentReturn(input?: {
  paymentLinkId?: string;
  referenceId?: string;
}): Promise<{ ok: true; paid: boolean } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (userHasPaidAccess(user)) {
      return { ok: true as const, paid: true };
    }

    let paymentLinkId = input?.paymentLinkId?.trim() || "";
    let referenceId = input?.referenceId?.trim() || "";

    if (!paymentLinkId && !referenceId) {
      const open = await getLatestOpenRazorpayPaymentLinkForUser(user.id);
      if (open) {
        paymentLinkId = open.razorpay_payment_link_id;
        referenceId = open.reference_id ?? "";
      }
    }

    if (!paymentLinkId && !referenceId) {
      return { ok: true as const, paid: false };
    }

    const result = await reconcilePaidPaymentLink({
      paymentLinkId,
      referenceId,
      expectedUserId: user.id,
      via: "return_poller_reconcile",
    });

    return { ok: true as const, paid: result.unlocked };
  } catch (error) {
    console.error("[billing] reconcileRazorpayPaymentReturn failed:", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}
