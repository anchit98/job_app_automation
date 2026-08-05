import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { setUserPaid } from "@/lib/auth/user";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import {
  getRazorpayPaymentLinkByRazorpayId,
  getRazorpayPaymentLinkByReferenceId,
  markRazorpayPaymentLinkPaid,
  type RazorpayPaymentLinkRow,
} from "@/lib/billing/razorpay-payment-links";

type WebhookEntity = {
  id?: string;
  reference_id?: string;
  status?: string;
  notes?: Record<string, unknown> | null;
};

function entityFrom(
  payload: Record<string, unknown> | undefined,
  key: string,
): WebhookEntity | null {
  const wrapper = payload?.[key] as { entity?: WebhookEntity } | undefined;
  return wrapper?.entity ?? null;
}

function noteUserId(entity: WebhookEntity | null): string {
  const value = entity?.notes?.user_id;
  return typeof value === "string" ? value : "";
}

function revalidateAfterPaid() {
  revalidatePath("/billing");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

async function unlockFromPaymentLink(
  link: RazorpayPaymentLinkRow,
  paymentId: string,
  event: string,
): Promise<void> {
  const alreadyPaid = link.status === "paid";
  if (!alreadyPaid) {
    await markRazorpayPaymentLinkPaid(link.razorpay_payment_link_id, paymentId);
  }
  await setUserPaid(link.user_id, true);
  if (!alreadyPaid) {
    await writeAuditLog(
      "payment.razorpay_link_paid",
      "razorpay_payment_links",
      link.id,
      {
        razorpay_payment_link_id: link.razorpay_payment_link_id,
        razorpay_payment_id: paymentId,
        via: event,
      },
    );
  }
  revalidateAfterPaid();
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: {
    event?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = body.event ?? "";

  try {
    if (event === "payment_link.paid") {
      const linkEntity = entityFrom(body.payload, "payment_link");
      const paymentEntity = entityFrom(body.payload, "payment");
      const paymentId = paymentEntity?.id ?? "";

      let link = linkEntity?.id
        ? await getRazorpayPaymentLinkByRazorpayId(linkEntity.id)
        : null;
      if (!link && linkEntity?.reference_id) {
        link = await getRazorpayPaymentLinkByReferenceId(
          linkEntity.reference_id,
        );
      }

      if (link) {
        await unlockFromPaymentLink(link, paymentId, event);
      } else {
        // Row missing (e.g. created from dashboard) — fall back to notes.user_id.
        const userId = noteUserId(linkEntity);
        if (userId) {
          await setUserPaid(userId, true);
          await writeAuditLog("payment.razorpay_link_paid", "users", userId, {
            razorpay_payment_link_id: linkEntity?.id ?? null,
            razorpay_payment_id: paymentId,
            via: `${event} (notes.user_id fallback)`,
          });
          revalidateAfterPaid();
        }
      }
    } else if (event === "payment.captured") {
      const paymentEntity = entityFrom(body.payload, "payment");
      const userId = noteUserId(paymentEntity);
      if (userId) {
        await setUserPaid(userId, true);
        await writeAuditLog("payment.razorpay_captured", "users", userId, {
          razorpay_payment_id: paymentEntity?.id ?? null,
          via: event,
        });
        revalidateAfterPaid();
      }
    }
    // Unknown events: acknowledge so Razorpay stops retrying.
  } catch (error) {
    console.error("[razorpay webhook] processing failed:", error);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
