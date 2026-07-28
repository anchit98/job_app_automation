"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  getPaymentClaimForReview,
  reviewPaymentClaim,
} from "@/lib/billing/payment-claims";
import { verifyPaymentReviewToken } from "@/lib/billing/payment-review-token";
import { dbGet } from "@/lib/db";
import { setUserPaid } from "@/lib/auth/user";

async function resolveEmailReviewerAdminId(): Promise<string | null> {
  const configured = process.env.ADMIN_NOTIFY_EMAIL?.split(",")[0]?.trim();
  if (configured) {
    const byEmail = (await dbGet(
      `SELECT id FROM users
        WHERE is_admin = true AND lower(email) = lower(?)
        LIMIT 1`,
      configured,
    )) as { id: string } | undefined;
    if (byEmail) return byEmail.id;
  }

  const first = (await dbGet(
    `SELECT id FROM users WHERE is_admin = true ORDER BY created_at ASC LIMIT 1`,
  )) as { id: string } | undefined;
  return first?.id ?? null;
}

const reviewSchema = z.object({
  token: z.string().min(20, "Invalid review link."),
  decision: z.enum(["approved", "rejected"]),
});

export async function reviewPaymentClaimViaEmailToken(input: {
  token: string;
  decision: "approved" | "rejected";
}) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const verified = await verifyPaymentReviewToken(parsed.data.token);
  if (!verified) {
    return {
      ok: false as const,
      error: "This review link is invalid or has expired.",
    };
  }

  const claim = await getPaymentClaimForReview(verified.claimId);
  if (!claim) {
    return { ok: false as const, error: "Payment claim not found." };
  }
  if (claim.status !== "pending") {
    return {
      ok: false as const,
      error: "This claim was already reviewed.",
      status: claim.status,
    };
  }

  const adminId = await resolveEmailReviewerAdminId();
  if (!adminId) {
    return {
      ok: false as const,
      error: "No admin account is available to record this review.",
    };
  }

  await reviewPaymentClaim({
    claimId: claim.id,
    status: parsed.data.decision,
    adminId,
  });

  if (parsed.data.decision === "approved") {
    await setUserPaid(claim.user_id, true);
    await writeAuditLog("admin.payment_approved", "payment_claims", claim.id, {
      via: "email_review_link",
      admin_user_id: adminId,
      user_id: claim.user_id,
      upi_reference: claim.upi_reference,
    });
  } else {
    await writeAuditLog("admin.payment_rejected", "payment_claims", claim.id, {
      via: "email_review_link",
      admin_user_id: adminId,
      user_id: claim.user_id,
      upi_reference: claim.upi_reference,
    });
  }

  revalidatePath("/admin-center");
  revalidatePath("/billing");
  revalidatePath(`/review-payment/${parsed.data.token}`);

  return {
    ok: true as const,
    status: parsed.data.decision,
  };
}
