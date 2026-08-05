import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { setUserPaid } from "@/lib/auth/user";
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
  }
  await setUserPaid(link.user_id, true);
  if (!alreadyPaid) {
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
  }
  revalidateAfterPaid();
}

export async function unlockUserById(
  userId: string,
  via: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await setUserPaid(userId, true);
  await writeAuditLog("payment.razorpay_link_paid", "users", userId, {
    ...meta,
    via,
  });
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
