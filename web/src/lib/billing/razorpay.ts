import Razorpay from "razorpay";
import {
  validatePaymentVerification,
  validateWebhookSignature,
} from "razorpay/dist/utils/razorpay-utils";
import { env, hasRazorpayConfig } from "@/lib/env";

export type RazorpayPaymentLinkCustomer = {
  name?: string;
  email?: string;
  contact?: string;
};

export type CreatePaymentLinkInput = {
  amountPaise: number;
  referenceId: string;
  userId: string;
  callbackUrl: string;
  description?: string;
  customer?: RazorpayPaymentLinkCustomer;
};

export type CreatedPaymentLink = {
  id: string;
  shortUrl: string;
  amountPaise: number;
  currency: string;
  referenceId: string;
  status: string;
};

export type PaymentLinkCallbackParams = {
  paymentLinkId: string;
  paymentId: string;
  paymentLinkReferenceId: string;
  paymentLinkStatus: string;
  signature: string;
};

function requireRazorpayConfig(): { keyId: string; keySecret: string } {
  if (!hasRazorpayConfig()) {
    throw new Error("Razorpay is not configured.");
  }
  const keyId = env.razorpayKeyId();
  const keySecret = env.razorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured.");
  }
  return { keyId, keySecret };
}

export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret } = requireRazorpayConfig();
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<CreatedPaymentLink> {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("Invalid payment amount.");
  }
  if (!input.referenceId.trim()) {
    throw new Error("referenceId is required.");
  }
  if (!input.userId.trim()) {
    throw new Error("userId is required.");
  }
  if (!input.callbackUrl.trim()) {
    throw new Error("callbackUrl is required.");
  }

  const client = getRazorpayClient();
  const customer = sanitizeCustomer(input.customer);

  // SDK types require `customer`; API accepts a minimal placeholder when omitted.
  const link = await client.paymentLink.create({
    amount: input.amountPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: input.referenceId,
    description: input.description ?? undefined,
    customer: customer ?? { name: "JobApp user" },
    notes: {
      user_id: input.userId,
    },
    notify: {
      sms: false,
      email: false,
    },
    reminder_enable: false,
    callback_url: input.callbackUrl,
    callback_method: "get",
  });

  const id = String(link.id ?? "");
  const shortUrl = String(link.short_url ?? "");
  if (!id || !shortUrl) {
    throw new Error("Razorpay Payment Link response missing id or short_url.");
  }

  return {
    id,
    shortUrl,
    amountPaise: Number(link.amount),
    currency: String(link.currency ?? "INR"),
    referenceId: String(link.reference_id ?? input.referenceId),
    status: String(link.status ?? "created"),
  };
}

/**
 * Verify Razorpay webhook signature (HMAC SHA256 of raw body with webhook secret).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  const secret = env.razorpayWebhookSecret();
  if (!secret || !signatureHeader) return false;
  try {
    return validateWebhookSignature(rawBody, signatureHeader, secret);
  } catch {
    return false;
  }
}

/**
 * Optional return-URL verification for Payment Link callback query params.
 * Uses the API key secret (not the webhook secret).
 */
export function verifyPaymentLinkCallbackSignature(
  params: PaymentLinkCallbackParams,
): boolean {
  const { keySecret } = requireRazorpayConfig();
  if (!params.signature) return false;
  try {
    return validatePaymentVerification(
      {
        payment_link_id: params.paymentLinkId,
        payment_id: params.paymentId,
        payment_link_reference_id: params.paymentLinkReferenceId,
        payment_link_status: params.paymentLinkStatus,
      },
      params.signature,
      keySecret,
    );
  } catch {
    return false;
  }
}

function sanitizeCustomer(
  customer: RazorpayPaymentLinkCustomer | undefined,
): RazorpayPaymentLinkCustomer | undefined {
  if (!customer) return undefined;
  const name = customer.name?.trim() || undefined;
  const email = customer.email?.trim() || undefined;
  const contact = customer.contact?.trim() || undefined;
  if (!name && !email && !contact) return undefined;
  return { name, email, contact };
}
