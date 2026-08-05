# Razorpay Payment Links (phased)

> **Preferred billing path.** User leaves `/billing` → pays on Razorpay’s hosted page → returns.  
> Goal: **Create Payment Link → redirect → signed webhook →** `setUserPaid(userId, true)`.  
> Unlock target already exists: `users.is_paid` via `setUserPaid()` in `web/src/lib/auth/user.ts`.

This is the **preferred billing path**. An earlier in-app Checkout.js plan (`docs/razorpay-integration.md`) was superseded and removed; do not resurrect Checkout.js unless product requires it.

Track progress by checking boxes as you finish each phase.

---

## Why this path


| Checkout.js (old plan)                     | Payment Links (this plan)                  |
| ------------------------------------------ | ------------------------------------------ |
| Embed Razorpay modal on your site          | Redirect to Razorpay-hosted page           |
| Client loads `checkout.js` + public key    | No Checkout script; no public key required |
| Create Order + open modal + client confirm | Create link → `redirect(short_url)`        |
| More UI / client edge cases                | Less frontend; webhook still unlocks       |


You still need server code for **create link**, **webhook**, and **DB mapping** to the user. You do **not** need an in-app payment UI.

---



## Status


| Phase | Name                                      | Status                                                       |
| ----- | ----------------------------------------- | ------------------------------------------------------------ |
| 0     | Product decisions                         | ✅ confirmed (₹299 lifetime, auto-unlock, Payment Links)     |
| 1     | Razorpay dashboard + keys + webhook       | ✅ keys + webhook secret in `web/.env.local` (test mode)      |
| 2     | Env helpers                               | ✅ verified in `web/src/lib/env.ts`                           |
| 3     | Database `razorpay_payment_links`         | ✅ schema + migrate + query helpers                          |
| 4     | Install `razorpay` SDK                    | ✅ `npm install razorpay`                                    |
| 5     | Server lib (create link + verify webhook) | ✅ `web/src/lib/billing/razorpay.ts`                         |
| 6     | Create-link + redirect server action      | ✅ `startRazorpayPaymentLink` in billing actions             |
| 7     | Billing UI (Pay → redirect)               | ✅ Razorpay primary CTA; UPI collapsed fallback              |
| 8     | Return / callback page (UX only)          | ✅ verified fast path + confirming poller                    |
| 9     | Webhook route (source of truth)           | ✅ verified raw-body sig; link paid + captured events        |
| 10    | Session / gate refresh                    | ✅ DB-backed `is_paid`; revalidate after unlock              |
| 11    | Admin fallback                            | ✅ Mark paid kept; recent Razorpay links; UPI nested         |
| 12    | Docs update                               | ✅ README / setup / architecture / edgecases                 |
| 13    | Local E2E test                            | ☐ ready — follow Phase 13 procedure below                    |
| 14    | Production go-live                        | ☐                                                            |


---



## Flow (end-to-end)

```text
Unpaid user on /billing
        │
        ▼
Clicks “Pay ₹299”
        │
        ▼
Server: create Payment Link (amount from env, notes.user_id)
        + insert razorpay_payment_links (status: created)
        │
        ▼
Redirect browser to payment_link.short_url  (Razorpay hosted)
        │
        ├── User cancels → returns unpaid
        │
        └── User pays successfully
                │
                ├── Razorpay redirect → /billing/razorpay/return?...  (show “confirming…”)
                │
                └── Webhook payment_link.paid / payment.captured
                        → mark link paid
                        → setUserPaid(userId, true)
                        → user refreshes / lands on onboarding or dashboard
```

**Source of truth = webhook.** The return URL is for UX only (never unlock from redirect params alone without signature verify **or** waiting for webhook).

---



## Phase 0 — Product decisions

1. **One-time ₹299** lifetime access (`NEXT_PUBLIC_PAYMENT_AMOUNT_INR`).
2. **Auto-unlock** after successful payment (no admin wait).
3. Keep Admin **Mark paid** as support override.
4. Hide manual UPI / UTR claim as primary path (optional emergency fallback later).
5. Prefer **Payment Links redirect** over Checkout.js.

- [x] Phase 0 done (confirmed)

---



## Phase 1 — Razorpay dashboard + keys



### 1.1 Account

1. Sign up / log in at [razorpay.com](https://razorpay.com).
2. Complete KYC when moving to **live** keys (test mode works earlier).
3. **Settings → API Keys** → generate **Test** Key ID + Key Secret.



### 1.2 Webhook (test)

1. **Settings → Webhooks → Add New Webhook**.
2. URL:
  - Local: tunnel to `https://<tunnel>/api/billing/razorpay/webhook`
  - Prod: `https://<YOUR_DOMAIN>/api/billing/razorpay/webhook`
3. Events (minimum):
  - `payment_link.paid` (preferred for this path)
  - `payment.captured` (backup / idempotent unlock)
4. Save and copy **Webhook Secret**.



### 1.3 Env in `web/.env.local`

```env
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx

NEXT_PUBLIC_PAYMENT_AMOUNT_INR=299
NEXT_PUBLIC_PAYMENT_PLAN_LABEL=Launch offer · 60 apps · lifetime access
```

**Notes**

- Payment Links do **not** require `NEXT_PUBLIC_RAZORPAY_KEY_ID` (no Checkout.js). You can omit it.
- Never commit secrets. Amount in Razorpay is **paise**: `299` INR → `29900`.
- Mirror the same vars on **Vercel** (Production + Preview) before go-live.

- [x] Phase 1 done (env verified; webhook secret present — confirm dashboard events if not already)

---



## Phase 2 — Env helpers

**File:** `web/src/lib/env.ts`

Verified present:

| Helper | Env var(s) | Notes |
|--------|------------|--------|
| `env.razorpayKeyId()` | `RAZORPAY_KEY_ID` (fallback `Razorpay_API_KEY`) | Server only |
| `env.razorpayKeySecret()` | `RAZORPAY_KEY_SECRET` (fallback `Razorpay_LIVE_KEY_SECRET`) | Server only |
| `env.razorpayWebhookSecret()` | `RAZORPAY_WEBHOOK_SECRET` (fallback `Razorpay_Webhook_Secret`) | Server only |
| `hasRazorpayConfig()` | key id + secret both non-empty | Used before create-link |
| `env.paymentAmountInr()` | `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | Already used on `/billing` |
| `env.paymentPlanLabel()` | `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | Already used on `/billing` |
| `env.appUrl()` | `NEXT_PUBLIC_APP_URL` | For Payment Link `callback_url` |

Also present but **not required** for Payment Links: `env.razorpayPublicKeyId()` (Checkout.js leftover).

Rules satisfied: secrets are not `NEXT_PUBLIC_*`; only key id has a public variant.

- [x] Phase 2 done (verified)

---



## Phase 3 — Database

The Checkout plan added `razorpay_orders`. For Payment Links, add a dedicated table (cleaner than overloading order IDs). Leave `razorpay_orders` unused for now; drop later if unused.

### 3.1 Table

```sql
CREATE TABLE IF NOT EXISTS razorpay_payment_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  razorpay_payment_link_id TEXT NOT NULL UNIQUE,
  short_url TEXT,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'expired', 'cancelled')),
  razorpay_payment_id TEXT,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT ((NOW() AT TIME ZONE 'utc')::text),
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS razorpay_payment_links_user_idx
  ON razorpay_payment_links (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS razorpay_payment_links_status_idx
  ON razorpay_payment_links (status, created_at DESC);
CREATE INDEX IF NOT EXISTS razorpay_payment_links_reference_idx
  ON razorpay_payment_links (reference_id);
```



### 3.2 Apply

1. Append to `supabase/schema.sql`.
2. Add `web/scripts/migrate-razorpay-payment-links.mjs`.
3. Run: `cd web && node scripts/migrate-razorpay-payment-links.mjs`

- [x] Phase 3.2 done (table already in DB; schema + migrate script added; migrate re-run OK)



### 3.3 Query helpers

**File:** `web/src/lib/billing/razorpay-payment-links.ts`

- `insertRazorpayPaymentLink(...)`
- `getRazorpayPaymentLinkByRazorpayId(paymentLinkId)`
- `getRazorpayPaymentLinkByReferenceId(referenceId)`
- `markRazorpayPaymentLinkPaid(paymentLinkId, paymentId)`

- [x] Phase 3 done

---



## Phase 4 — Install SDK

```bash
cd web
npm install razorpay
```

(Or call Payment Links REST API with Basic auth; SDK is fine if types are acceptable.)

- [x] Phase 4 done

---



## Phase 5 — Server lib

**File:** `web/src/lib/billing/razorpay.ts`

Implement:

1. Razorpay client with key id + secret.
2. `createPaymentLink({ amountPaise, referenceId, userId, customer, callbackUrl, description })`
  - `currency: INR`
  - `notes: { user_id }`
  - `callback_url` + `callback_method: get` (return to our app)
  - `reference_id` = our unique receipt (maps row ↔ link)
3. `verifyWebhookSignature(rawBody, signatureHeader)`
  HMAC SHA256 of **raw body** with **webhook secret**.
4. Optional: `verifyPaymentLinkCallbackSignature(...)` if you want optimistic unlock on return URL (still keep webhook idempotent).

- [x] Phase 5 done

---



## Phase 6 — Create-link + redirect

**File:** `web/src/app/actions/billing.ts` (or `razorpay-billing.ts`)

`startRazorpayPaymentLink()`:

1. `requireUser()`; reject if already paid.
2. Guard: Razorpay config present (`hasRazorpayConfig()`).
3. `amountPaise = Math.round(Number(env.paymentAmountInr()) * 100)`.
4. `referenceId =` short unique string (e.g. `jap_<userIdPrefix>_<uuid>`).
5. Create Payment Link via Razorpay:
  - amount, currency, description from plan label
  - `notes.user_id`
  - `callback_url = ${appUrl}/billing/razorpay/return`
6. Insert `razorpay_payment_links` (`status: created`, store `short_url`).
7. Audit `payment.razorpay_link_created`.
8. `redirect(short_url)` (or return URL and let the button navigate — prefer server `redirect`).

Reuse an open **created** link for the same user within a short window if you want to avoid spam; otherwise always create a fresh link (simpler).

- [x] Phase 6 done

---



## Phase 7 — Billing UI

1. Update `web/src/app/(app)/billing/page.tsx`
  - Primary CTA: form/button calling `startRazorpayPaymentLink`
  - Copy: “You’ll pay securely on Razorpay. Access unlocks automatically after payment.”
  - Hide/collapse manual UPI + UTR form
2. No Checkout.js script. No client Razorpay modal.

- [x] Phase 7 done

---



## Phase 8 — Return page (UX only)

**File:** `web/src/app/(app)/billing/razorpay/return/page.tsx` (or route handler)

1. Query params may include `razorpay_payment_id`, `razorpay_payment_link_id`, `razorpay_payment_link_reference_id`, `razorpay_signature` (names per Razorpay docs).
2. Show “Confirming payment…” and poll/refresh session, **or** verify callback signature then mark paid (optional fast path).
3. If already paid → redirect to `/onboarding` or `/dashboard` (same gate logic as today).
4. If not yet paid (webhook lag) → soft message + auto-refresh a few times; do not error permanently.

Do **not** trust unpaid → paid from query params without signature verification.

- [x] Phase 8 done

---



## Phase 9 — Webhook (source of truth)

**File:** `web/src/app/api/billing/razorpay/webhook/route.ts`

1. Read **raw** body text; verify `X-Razorpay-Signature`.
2. Handle:
  - `payment_link.paid` → resolve `payment_link.id` or `reference_id` → user → mark paid → `setUserPaid`
  - `payment.captured` → resolve via `notes.user_id` and/or linked payment link / order metadata
3. Idempotent: already paid → `200`.
4. Add path to middleware **public** allowlist (no login).
5. Audit `payment.razorpay_link_paid`.

- [x] Phase 9 done

---



## Phase 10 — Session / gate

1. Unpaid users still land on `/billing`.
2. After webhook, `userHasPaidAccess` / session `is_paid` becomes true.
3. If JWT caches `is_paid`, re-issue session on return page once paid; if each request loads from DB, `router.refresh()` is enough.

**Verified:** JWT does **not** cache `is_paid` (only `sid` / `uid` / admin / reset flags). `getSessionUser()` joins `users.is_paid` from the DB on every request, so `router.refresh()` on the return poller is enough — no session re-issue needed.

**Hardening applied:**
- App layout redirects paid users off the entire `/billing` tree (offer + return).
- Return page + webhook call `revalidatePath` for billing / onboarding / dashboard / root layout after unlock.
- PaidAccessGate copy updated for auto-unlock via Razorpay.

- [x] Phase 10 done

---



## Phase 11 — Admin fallback

1. Keep Admin Mark paid / Unpaid.
2. Optional: list recent `razorpay_payment_links` in Admin Center.
3. Keep `payment_claims` dormant or behind a flag.

**Done:**
- Users ⋮ menu still has **Mark paid** / revoke unpaid (`adminSetUserPaid`).
- Admin Center shows **Recent Razorpay links** (last 25) with status badges.
- Manual UPI claims live under a collapsed **Manual UPI claims (legacy)** details block (auto-opens only when something is pending).

- [x] Phase 11 done

---



## Phase 12 — Docs

Update:

- `README.md` — Payment Links as primary billing
- `docs/setup.md` — env + webhook URL + events
- `docs/architecture.md` — billing section
- `docs/edgecases.md` — webhook replay, abandoned link, already paid, cancel on Razorpay
- Mark Checkout.js plan superseded (old `docs/razorpay-integration.md` removed)

- [x] Phase 12 done

---



## Phase 13 — Local E2E test

### Prerequisites (already verified in env)

- Test keys: `RAZORPAY_KEY_ID` starts with `rzp_test_`
- `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` present in `web/.env.local`
- Amount `299`; `NEXT_PUBLIC_APP_URL` can stay `http://localhost:3000` (browser return URL)

### Exact test procedure

**A. Start the app**

```bash
cd web
npm run dev
```

Open `http://localhost:3000`.

**B. Expose the webhook (required — Razorpay cannot hit localhost)**

In a second terminal, pick one:

```bash
# Option 1 — Cloudflare (no account needed for quick try)
npx --yes cloudflared tunnel --url http://localhost:3000

# Option 2 — ngrok (if installed)
ngrok http 3000
```

Copy the HTTPS URL (e.g. `https://abc123.trycloudflare.com`).

**C. Point Razorpay test webhook at the tunnel**

1. Razorpay Dashboard → **Test mode** → **Settings → Webhooks**.
2. Edit (or add) webhook URL to:
   `https://<YOUR_TUNNEL>/api/billing/razorpay/webhook`
3. Events enabled: **`payment_link.paid`**, **`payment.captured`**.
4. Confirm the dashboard webhook secret matches `RAZORPAY_WEBHOOK_SECRET` in `.env.local` (if you recreate the webhook, update the env + restart `npm run dev`).

**D. Happy path — pay**

1. Sign in as an **unpaid** user (or create a new signup).
2. You should land on `/billing`.
3. Click **Pay securely via Razorpay** → you leave the app for Razorpay’s hosted page.
4. Complete payment with Razorpay **test** methods (UPI/card test credentials from [Razorpay test docs](https://razorpay.com/docs/payments/payments/test-card-upi-details/)).
5. After pay, browser returns to `/billing/razorpay/return` (“Confirming…” may flash).
6. You should be redirected to `/onboarding` (or `/dashboard` if setup was already done).

**E. Assert DB**

```bash
cd web
node scripts/inspect-razorpay-e2e.mjs you@example.com
```

Expect:

- `user.is_paid: true`
- Latest link `status: "paid"` and a non-null `razorpay_payment_id`

**F. Replay webhook (idempotent)**

In Razorpay Dashboard → Webhooks → that delivery → **Resend** (or redeliver `payment_link.paid`).

- App still returns 200.
- User stays paid once (no crash / no duplicate unlock failure).
- Re-run inspect script — still one paid row for that payment.

**G. Cancel path**

1. Admin **Mark unpaid** that test user (or use another unpaid account).
2. `/billing` → Pay → on Razorpay page click **Cancel** / close without paying.
3. Inspect script: latest link still `created` (or unpaid user); `is_paid: false`.
4. Gate still blocks Dashboard/Apply.

### Pass criteria

| Check | Pass |
|-------|------|
| Redirect to Razorpay works | ☐ |
| Test payment completes | ☐ |
| Link row → `paid` | ☐ |
| `users.is_paid` → true | ☐ |
| Gate unlocks (onboarding/dashboard) | ☐ |
| Webhook replay stays paid once | ☐ |
| Cancel stays unpaid | ☐ |

- [ ] Phase 13 done (check after you finish the runs above)

---



## Phase 14 — Production go-live

1. KYC approved; generate **Live** keys.
2. Update Vercel env (live key id / secret / webhook secret).
3. Live webhook → production URL with `payment_link.paid` + `payment.captured`.
4. Deploy.
5. One real smoke payment.
6. Remove/hide manual UPI on `/billing`.

- [ ] Phase 14 done

---



## Critical rules

1. Never unlock from redirect query params alone without signature verify **or** webhook.
2. Webhook must verify against **raw body**.
3. Server amount comes from env — never trust client amount.
4. Paid updates must be **idempotent**.
5. Secrets only on server (`KEY_SECRET`, `WEBHOOK_SECRET`).
6. Always put `user_id` in Payment Link `notes` (and store our `reference_id`) so webhook can map payment → user.

---



## Files map


| Area                     | Path                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| Guide (this file)        | `docs/razorpay-payment-links.md`                                        |
| Env                      | `web/src/lib/env.ts`, `web/.env.local`, Vercel                          |
| DB                       | `supabase/schema.sql`, `web/scripts/migrate-razorpay-payment-links.mjs` |
| Link queries             | `web/src/lib/billing/razorpay-payment-links.ts`                         |
| Razorpay helpers         | `web/src/lib/billing/razorpay.ts`                                       |
| Actions                  | `web/src/app/actions/billing.ts` (or `razorpay-billing.ts`)             |
| Webhook                  | `web/src/app/api/billing/razorpay/webhook/route.ts`                     |
| Return UX                | `web/src/app/(app)/billing/razorpay/return/page.tsx`                    |
| Page                     | `web/src/app/(app)/billing/page.tsx`                                    |
| Middleware               | public allowlist for webhook                                            |


---



## Carry-over from Checkout work already done


| Already done                                   | Reuse?                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| Product: ₹299 / auto-unlock                    | Yes                                                     |
| API keys + webhook secret in env               | Yes                                                     |
| `env.ts` Razorpay helpers                      | Yes                                                     |
| `razorpay_orders` table + `razorpay-orders.ts` | No — leave unused; use `razorpay_payment_links` instead |


---



## How we run this

Work **one phase at a time**. After each phase: mark the checkbox above, smoke-check, then continue.

**Next up:** Complete Phase 13 checklist (you), then Phase 14 go-live.