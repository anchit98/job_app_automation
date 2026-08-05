import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import {
  getRazorpayPaymentLinkByRazorpayId,
  getRazorpayPaymentLinkByReferenceId,
} from "@/lib/billing/razorpay-payment-links";
import {
  reconcilePaidPaymentLink,
  unlockFromPaymentLinkRow,
  unlockUserById,
} from "@/lib/billing/razorpay-unlock";

export const runtime = "nodejs";

type WebhookEntity = {
  id?: string;
  reference_id?: string;
  status?: string;
  notes?: Record<string, unknown> | unknown[] | null;
  description?: string | null;
};

function entityFrom(
  payload: Record<string, unknown> | undefined,
  key: string,
): WebhookEntity | null {
  const wrapper = payload?.[key] as { entity?: WebhookEntity } | undefined;
  return wrapper?.entity ?? null;
}

function noteUserId(entity: WebhookEntity | null): string {
  const notes = entity?.notes;
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return "";
  const value = (notes as Record<string, unknown>).user_id;
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[razorpay webhook] invalid signature");
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
        await unlockFromPaymentLinkRow(link, paymentId, event);
      } else {
        const userId = noteUserId(linkEntity);
        if (userId) {
          await unlockUserById(userId, `${event} (notes.user_id fallback)`, {
            razorpay_payment_link_id: linkEntity?.id ?? null,
            razorpay_payment_id: paymentId || null,
          });
        } else if (linkEntity?.id) {
          // Last resort: confirm via Razorpay API fetch.
          await reconcilePaidPaymentLink({
            paymentLinkId: linkEntity.id,
            referenceId: linkEntity.reference_id,
            via: `${event} (api reconcile)`,
          });
        } else {
          console.error("[razorpay webhook] payment_link.paid unmatched", {
            linkId: linkEntity?.id ?? null,
            referenceId: linkEntity?.reference_id ?? null,
          });
        }
      }
    } else if (event === "payment.captured") {
      const paymentEntity = entityFrom(body.payload, "payment");
      const userId = noteUserId(paymentEntity);
      if (userId) {
        await unlockUserById(userId, event, {
          razorpay_payment_id: paymentEntity?.id ?? null,
        });
      } else {
        // Payment notes are often empty for Payment Links — ignore quietly.
        console.info(
          "[razorpay webhook] payment.captured without notes.user_id; waiting for payment_link.paid",
        );
      }
    }
  } catch (error) {
    console.error("[razorpay webhook] processing failed:", error);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
