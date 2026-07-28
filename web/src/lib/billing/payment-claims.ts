import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db";

export type PaymentClaimStatus = "pending" | "approved" | "rejected";

export type PaymentClaim = {
  id: string;
  user_id: string;
  upi_reference: string;
  note: string | null;
  status: PaymentClaimStatus;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  email?: string;
  full_name?: string | null;
};

export async function getLatestPaymentClaim(
  userId: string,
): Promise<PaymentClaim | null> {
  const row = (await dbGet(
    `SELECT id, user_id, upi_reference, note, status,
            reviewed_by_admin_id, reviewed_at, created_at
       FROM payment_claims
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    userId,
  )) as PaymentClaim | undefined;
  return row ?? null;
}

export async function getOpenPaymentClaim(
  userId: string,
): Promise<PaymentClaim | null> {
  const row = (await dbGet(
    `SELECT id, user_id, upi_reference, note, status,
            reviewed_by_admin_id, reviewed_at, created_at
       FROM payment_claims
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    userId,
  )) as PaymentClaim | undefined;
  return row ?? null;
}

export async function createPaymentClaim(input: {
  userId: string;
  upiReference: string;
  note?: string | null;
}): Promise<PaymentClaim> {
  const id = randomUUID();
  await dbRun(
    `INSERT INTO payment_claims (id, user_id, upi_reference, note, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    id,
    input.userId,
    input.upiReference.trim(),
    input.note?.trim() || null,
  );
  const claim = await getLatestPaymentClaim(input.userId);
  if (!claim) throw new Error("Failed to create payment claim.");
  return claim;
}

export async function listPendingPaymentClaims(): Promise<PaymentClaim[]> {
  return (await dbAll(
    `SELECT c.id, c.user_id, c.upi_reference, c.note, c.status,
            c.reviewed_by_admin_id, c.reviewed_at, c.created_at,
            u.email, COALESCE(p.full_name, u.full_name) AS full_name
       FROM payment_claims c
       INNER JOIN users u ON u.id = c.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at ASC`,
  )) as PaymentClaim[];
}

export async function getPaymentClaimById(
  claimId: string,
): Promise<PaymentClaim | null> {
  const row = (await dbGet(
    `SELECT id, user_id, upi_reference, note, status,
            reviewed_by_admin_id, reviewed_at, created_at
       FROM payment_claims
      WHERE id = ?`,
    claimId,
  )) as PaymentClaim | undefined;
  return row ?? null;
}

export async function getPaymentClaimForReview(
  claimId: string,
): Promise<PaymentClaim | null> {
  const row = (await dbGet(
    `SELECT c.id, c.user_id, c.upi_reference, c.note, c.status,
            c.reviewed_by_admin_id, c.reviewed_at, c.created_at,
            u.email, COALESCE(p.full_name, u.full_name) AS full_name
       FROM payment_claims c
       INNER JOIN users u ON u.id = c.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE c.id = ?`,
    claimId,
  )) as PaymentClaim | undefined;
  return row ?? null;
}

export async function reviewPaymentClaim(input: {
  claimId: string;
  status: "approved" | "rejected";
  adminId: string;
}): Promise<void> {
  await dbRun(
    `UPDATE payment_claims
        SET status = ?,
            reviewed_by_admin_id = ?,
            reviewed_at = ((NOW() AT TIME ZONE 'utc')::text)
      WHERE id = ? AND status = 'pending'`,
    input.status,
    input.adminId,
    input.claimId,
  );
}
