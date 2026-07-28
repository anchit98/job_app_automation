"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  createPaymentClaim,
  getOpenPaymentClaim,
} from "@/lib/billing/payment-claims";
import { notifyAdminsOfPaymentClaim } from "@/lib/billing/payment-claim-email";
import { requireUser, userHasPaidAccess } from "@/lib/auth/user";

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
