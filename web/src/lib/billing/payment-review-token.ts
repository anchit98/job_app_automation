import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const PURPOSE = "payment_claim_review";
const TOKEN_TTL = "7d";

function secretKey() {
  return new TextEncoder().encode(env.authSecret());
}

export async function createPaymentReviewToken(claimId: string): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    claim_id: claimId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyPaymentReviewToken(
  token: string,
): Promise<{ claimId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== PURPOSE) return null;
    const claimId =
      typeof payload.claim_id === "string" ? payload.claim_id.trim() : "";
    if (!claimId) return null;
    return { claimId };
  } catch {
    return null;
  }
}

export async function paymentReviewUrl(claimId: string): Promise<string> {
  const token = await createPaymentReviewToken(claimId);
  const appUrl = env.appUrl().replace(/\/$/, "");
  return `${appUrl}/review-payment/${encodeURIComponent(token)}`;
}
