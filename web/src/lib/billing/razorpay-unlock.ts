import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getUserById, setUserPaid } from "@/lib/auth/user";
import { addApplyCredits, applyTierPurchase } from "@/lib/billing/entitlements";
import { resolvePurchase } from "@/lib/billing/pricing";
import { env } from "@/lib/env";
import {
  formatPaiseAsInr,
  sendPaymentReceipt,
} from "@/lib/billing/payment-receipt-email";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import {
  getRazorpayPaymentLinkByRazorpayId,
  getRazorpayPaymentLinkByReferenceId,
  markRazorpayPaymentLinkPaid,
  type RazorpayPaymentLinkRow,
} from "@/lib/billing/razorpay-payment-links";

export function revalidateAfterPaid() {
  revalidatePath("/billing");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/admin-center");
  revalidatePath("/", "layout");
}

/**
 * Grant what this link actually bought.
 *
 * Three shapes, and the difference matters:
 *
 *   - **A plan** adds that tier's credits and records the tier. It must *not*
 *     go through `setUserPaid`, which moves the account onto
 *     `legacy_lifetime` — the unmetered grandfathered plan. Paying ₹100 for
 *     Starter and silently receiving unlimited runs would be a bug worth real
 *     money.
 *   - **A top-up** adds Apply runs and leaves the plan alone.
 *   - **Neither** — a link created before tiers existed, which can only be the
 *     ₹299 lifetime offer. That one really is `setUserPaid`.
 */
async function grantPurchase(link: RazorpayPaymentLinkRow): Promise<void> {
  const purchase =
    link.purchase_kind && link.purchase_code
      ? resolvePurchase(link.purchase_kind, link.purchase_code)
      : null;

  if (!purchase) {
    await setUserPaid(link.user_id, true);
    return;
  }

  if (purchase.kind === "plan") {
    await applyTierPurchase(
      link.user_id,
      purchase.code as Parameters<typeof applyTierPurchase>[1],
    );
    return;
  }
  await addApplyCredits(link.user_id, purchase.applyRuns);
}

/** What the receipt should call this purchase. */
function purchaseLabel(link: RazorpayPaymentLinkRow): string {
  const purchase =
    link.purchase_kind && link.purchase_code
      ? resolvePurchase(link.purchase_kind, link.purchase_code)
      : null;
  return purchase?.label ?? env.paymentPlanLabel();
}

export async function unlockFromPaymentLinkRow(
  link: RazorpayPaymentLinkRow,
  paymentId: string,
  via: string,
): Promise<void> {
  const alreadyPaid = link.status === "paid";
  if (!alreadyPaid) {
    await markRazorpayPaymentLinkPaid(
      link.razorpay_payment_link_id,
      paymentId || link.razorpay_payment_id || "",
    );
    // Credits are additive, so this has to run exactly once. Razorpay retries
    // webhooks; the status transition above is what makes that safe.
    await grantPurchase(link);

    await writeAuditLog(
      "payment.razorpay_link_paid",
      "razorpay_payment_links",
      link.id,
      {
        razorpay_payment_link_id: link.razorpay_payment_link_id,
        razorpay_payment_id: paymentId || null,
        via,
      },
    );
    // Only on the transition. Razorpay retries webhooks, and a receipt per
    // retry is worse than no receipt at all.
    await sendPaymentReceipt({
      userId: link.user_id,
      amountInr: formatPaiseAsInr(link.amount_paise),
      planLabel: purchaseLabel(link),
      reference: paymentId || link.razorpay_payment_id || link.razorpay_payment_link_id,
      method: "razorpay",
    });
  }
  revalidateAfterPaid();
}

export async function unlockUserById(
  userId: string,
  via: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  // Whether this user was already paid decides whether a receipt is owed —
  // webhooks are retried, and this path has no payment-link row to record
  // "already handled" on.
  const alreadyPaid = (await getUserById(userId))?.is_paid === true;

  await setUserPaid(userId, true);
  await writeAuditLog("payment.razorpay_link_paid", "users", userId, {
    ...meta,
    via,
  });

  if (!alreadyPaid) {
    await sendPaymentReceipt({
      userId,
      amountInr: `₹${env.paymentAmountInr()}`,
      planLabel: env.paymentPlanLabel(),
      reference: String(
        meta.razorpay_payment_id ?? meta.razorpay_payment_link_id ?? "",
      ),
      method: "razorpay",
    });
  }
  revalidateAfterPaid();
}

function notesUserId(notes: unknown): string {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return "";
  const value = (notes as Record<string, unknown>).user_id;
  return typeof value === "string" ? value : "";
}

function firstCapturedPaymentId(payments: unknown): string {
  if (!Array.isArray(payments)) return "";
  for (const entry of payments) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const status = String(row.status ?? "");
    const id = String(row.payment_id ?? row.id ?? "");
    if (id && (status === "captured" || status === "authorized" || !status)) {
      return id;
    }
  }
  return "";
}

export type RemotePaymentLinkStatus = {
  id: string;
  status: string;
  referenceId: string;
  notesUserId: string;
  paymentId: string;
};

export async function fetchRemotePaymentLink(
  paymentLinkId: string,
): Promise<RemotePaymentLinkStatus | null> {
  if (!paymentLinkId.trim()) return null;
  try {
    const client = getRazorpayClient();
    const link = await client.paymentLink.fetch(paymentLinkId);
    return {
      id: String(link.id ?? paymentLinkId),
      status: String(link.status ?? ""),
      referenceId: String(link.reference_id ?? ""),
      notesUserId: notesUserId(link.notes),
      paymentId: firstCapturedPaymentId(
        (link as { payments?: unknown }).payments,
      ),
    };
  } catch (error) {
    console.error("[razorpay] fetch payment link failed:", paymentLinkId, error);
    return null;
  }
}

/**
 * Confirm a Payment Link is paid on Razorpay and unlock the mapped user.
 * Used when webhook delivery lags or fails.
 */
export async function reconcilePaidPaymentLink(opts: {
  paymentLinkId?: string | null;
  referenceId?: string | null;
  expectedUserId?: string | null;
  via: string;
}): Promise<{ unlocked: boolean; userId: string | null }> {
  let link: RazorpayPaymentLinkRow | null = null;
  if (opts.paymentLinkId) {
    link = await getRazorpayPaymentLinkByRazorpayId(opts.paymentLinkId);
  }
  if (!link && opts.referenceId) {
    link = await getRazorpayPaymentLinkByReferenceId(opts.referenceId);
  }

  const remoteId = opts.paymentLinkId || link?.razorpay_payment_link_id || "";
  const remote = remoteId ? await fetchRemotePaymentLink(remoteId) : null;
  if (!remote || remote.status !== "paid") {
    return { unlocked: false, userId: link?.user_id ?? null };
  }

  if (!link && remote.referenceId) {
    link = await getRazorpayPaymentLinkByReferenceId(remote.referenceId);
  }

  const userId =
    link?.user_id ||
    remote.notesUserId ||
    (opts.expectedUserId?.trim() ? opts.expectedUserId : "");

  if (!userId) {
    return { unlocked: false, userId: null };
  }

  if (opts.expectedUserId && opts.expectedUserId !== userId) {
    return { unlocked: false, userId };
  }

  if (link) {
    await unlockFromPaymentLinkRow(
      link,
      remote.paymentId || link.razorpay_payment_id || "",
      opts.via,
    );
  } else {
    await unlockUserById(userId, opts.via, {
      razorpay_payment_link_id: remote.id,
      razorpay_payment_id: remote.paymentId || null,
      reference_id: remote.referenceId || null,
    });
  }

  return { unlocked: true, userId };
}
