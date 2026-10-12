-- Tier and top-up purchases.
--
-- Every Razorpay payment link meant the same thing until now: the ₹299
-- lifetime offer. Unlocking was therefore a single boolean flip, and the row
-- did not have to record what had been bought.
--
-- With a plan ladder and credit packs the webhook has to know. `purchase_kind`
-- says which catalogue to look in ('plan' | 'topup'), `purchase_code` says
-- which entry ('pro', 'apply_60'). Both nullable: links created before this
-- migration carry neither, and the unlock path reads a missing pair as the
-- legacy lifetime offer — which is exactly what those links are.
--
-- The codes are the ones in web/src/lib/billing/pricing.ts. Renaming an entry
-- there orphans any link already out in the world, so they are treated as
-- stable identifiers rather than labels.

ALTER TABLE razorpay_payment_links
  ADD COLUMN IF NOT EXISTS purchase_kind TEXT,
  ADD COLUMN IF NOT EXISTS purchase_code TEXT;
