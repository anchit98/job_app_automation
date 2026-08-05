import { randomUUID } from "crypto";
import { dbGet, dbRun } from "@/lib/db";

export type RazorpayOrderStatus = "created" | "paid" | "failed";

export type RazorpayOrderRow = {
  id: string;
  user_id: string;
  razorpay_order_id: string;
  amount_paise: number;
  currency: string;
  status: RazorpayOrderStatus;
  razorpay_payment_id: string | null;
  receipt: string | null;
  created_at: string;
  paid_at: string | null;
};

function mapRow(row: Record<string, unknown>): RazorpayOrderRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    razorpay_order_id: String(row.razorpay_order_id),
    amount_paise: Number(row.amount_paise),
    currency: String(row.currency ?? "INR"),
    status: row.status as RazorpayOrderStatus,
    razorpay_payment_id:
      row.razorpay_payment_id == null ? null : String(row.razorpay_payment_id),
    receipt: row.receipt == null ? null : String(row.receipt),
    created_at: String(row.created_at),
    paid_at: row.paid_at == null ? null : String(row.paid_at),
  };
}

export async function insertRazorpayOrder(input: {
  userId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency?: string;
  receipt?: string;
}): Promise<RazorpayOrderRow> {
  const id = randomUUID();
  await dbRun(
    `INSERT INTO razorpay_orders
      (id, user_id, razorpay_order_id, amount_paise, currency, status, receipt)
     VALUES (?, ?, ?, ?, ?, 'created', ?)`,
    id,
    input.userId,
    input.razorpayOrderId,
    input.amountPaise,
    input.currency ?? "INR",
    input.receipt ?? null,
  );
  const row = await getRazorpayOrderById(id);
  if (!row) throw new Error("Failed to create razorpay order row.");
  return row;
}

export async function getRazorpayOrderById(
  id: string,
): Promise<RazorpayOrderRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_orders WHERE id = ?`,
    id,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getRazorpayOrderByRazorpayId(
  razorpayOrderId: string,
): Promise<RazorpayOrderRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_orders WHERE razorpay_order_id = ?`,
    razorpayOrderId,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function markRazorpayOrderPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<RazorpayOrderRow | null> {
  await dbRun(
    `UPDATE razorpay_orders
        SET status = 'paid',
            razorpay_payment_id = ?,
            paid_at = COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
      WHERE razorpay_order_id = ?`,
    razorpayPaymentId,
    razorpayOrderId,
  );
  return getRazorpayOrderByRazorpayId(razorpayOrderId);
}
