import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db";

export type RazorpayPaymentLinkStatus =
  | "created"
  | "paid"
  | "expired"
  | "cancelled";

export type RazorpayPaymentLinkRow = {
  id: string;
  user_id: string;
  razorpay_payment_link_id: string;
  short_url: string | null;
  amount_paise: number;
  currency: string;
  status: RazorpayPaymentLinkStatus;
  razorpay_payment_id: string | null;
  reference_id: string | null;
  created_at: string;
  paid_at: string | null;
};

function mapRow(row: Record<string, unknown>): RazorpayPaymentLinkRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    razorpay_payment_link_id: String(row.razorpay_payment_link_id),
    short_url: row.short_url == null ? null : String(row.short_url),
    amount_paise: Number(row.amount_paise),
    currency: String(row.currency ?? "INR"),
    status: row.status as RazorpayPaymentLinkStatus,
    razorpay_payment_id:
      row.razorpay_payment_id == null ? null : String(row.razorpay_payment_id),
    reference_id: row.reference_id == null ? null : String(row.reference_id),
    created_at: String(row.created_at),
    paid_at: row.paid_at == null ? null : String(row.paid_at),
  };
}

export async function insertRazorpayPaymentLink(input: {
  userId: string;
  razorpayPaymentLinkId: string;
  amountPaise: number;
  currency?: string;
  shortUrl?: string;
  referenceId?: string;
}): Promise<RazorpayPaymentLinkRow> {
  const id = randomUUID();
  await dbRun(
    `INSERT INTO razorpay_payment_links
      (id, user_id, razorpay_payment_link_id, short_url, amount_paise, currency, status, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, 'created', ?)`,
    id,
    input.userId,
    input.razorpayPaymentLinkId,
    input.shortUrl ?? null,
    input.amountPaise,
    input.currency ?? "INR",
    input.referenceId ?? null,
  );
  const row = await getRazorpayPaymentLinkById(id);
  if (!row) throw new Error("Failed to create razorpay payment link row.");
  return row;
}

export async function getRazorpayPaymentLinkById(
  id: string,
): Promise<RazorpayPaymentLinkRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_payment_links WHERE id = ?`,
    id,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getRazorpayPaymentLinkByRazorpayId(
  razorpayPaymentLinkId: string,
): Promise<RazorpayPaymentLinkRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_payment_links WHERE razorpay_payment_link_id = ?`,
    razorpayPaymentLinkId,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getRazorpayPaymentLinkByReferenceId(
  referenceId: string,
): Promise<RazorpayPaymentLinkRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_payment_links WHERE reference_id = ?`,
    referenceId,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getLatestOpenRazorpayPaymentLinkForUser(
  userId: string,
): Promise<RazorpayPaymentLinkRow | null> {
  const row = (await dbGet(
    `SELECT * FROM razorpay_payment_links
      WHERE user_id = ? AND status = 'created'
      ORDER BY created_at DESC
      LIMIT 1`,
    userId,
  )) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function markRazorpayPaymentLinkPaid(
  razorpayPaymentLinkId: string,
  razorpayPaymentId: string,
): Promise<RazorpayPaymentLinkRow | null> {
  await dbRun(
    `UPDATE razorpay_payment_links
        SET status = 'paid',
            razorpay_payment_id = ?,
            paid_at = COALESCE(paid_at, ((NOW() AT TIME ZONE 'utc')::text))
      WHERE razorpay_payment_link_id = ?`,
    razorpayPaymentId,
    razorpayPaymentLinkId,
  );
  return getRazorpayPaymentLinkByRazorpayId(razorpayPaymentLinkId);
}

export type RazorpayPaymentLinkAdminRow = RazorpayPaymentLinkRow & {
  email: string;
  full_name: string | null;
};

export async function listRecentRazorpayPaymentLinks(
  limit = 25,
): Promise<RazorpayPaymentLinkAdminRow[]> {
  const rows = (await dbAll(
    `SELECT pl.*, u.email, u.full_name
       FROM razorpay_payment_links pl
       INNER JOIN users u ON u.id = pl.user_id
      ORDER BY pl.created_at DESC
      LIMIT ?`,
    Math.max(1, Math.min(limit, 100)),
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...mapRow(row),
    email: String(row.email ?? ""),
    full_name: row.full_name == null ? null : String(row.full_name),
  }));
}
