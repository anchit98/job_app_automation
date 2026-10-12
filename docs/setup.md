# Setup Guide — JobApp OS

Multi-user hosted app. **Metadata** in **Supabase Postgres**. **Files** in **Google Drive**. **LLM generations** via **OpenAI** (`gpt-4.1-mini`) for Apply. Optional **JobApp Bridge** for ChatGPT paste fallback.

Brand in the UI: **JobApp OS**.

---

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste and run [`supabase/schema.sql`](../supabase/schema.sql).
3. **Project Settings → Database** → connection string:
   - Local / long-running Node: **Direct** or **Session** URI (port `5432`)
   - Vercel / serverless: **Transaction** pooler URI (port `6543`)
4. Seed prompt templates (after `DATABASE_URL` is set):

```bash
cd web
# PowerShell: $env:DATABASE_URL="postgresql://..."
node scripts/seed-prompt-templates.mjs
```

### Existing databases (migrations)

```bash
cd web
node scripts/migrate-auth-multitenant.mjs
node scripts/migrate-setup-guide.mjs
node scripts/migrate-profile-avatar.mjs
node scripts/migrate-admin-auth.mjs
node scripts/migrate-manual-payments.mjs
```

Prefer full [`supabase/schema.sql`](../supabase/schema.sql) for new projects. Prompt-body updates may also live under `web/db/migrations/*.sql` (apply via your usual SQL workflow).

**Admin:** first signup on an empty `users` table becomes admin. Promote later with `node scripts/promote-admin-user.mjs <email>`.

### Razorpay Payment Links (primary billing)

New signups land on `/billing` until payment succeeds. Primary path: create a Razorpay Payment Link → redirect to Razorpay hosted checkout → signed webhook unlocks `users.is_paid`.

| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay Key ID (server; test `rzp_test_…` or live) |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC secret (server only) |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | Amount in INR (default **`299`**) |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | Default: launch offer · 60 apps · lifetime access |
| `NEXT_PUBLIC_UPI_ID` | Optional legacy UPI fallback VPA |

**Webhook (required for auto-unlock)**

1. Razorpay Dashboard → **Settings → Webhooks → Add**.
2. URL:
   - Local: tunnel to `https://<tunnel>/api/billing/razorpay/webhook`
   - Prod: `https://<YOUR_DOMAIN>/api/billing/razorpay/webhook`
3. Events (minimum): `payment_link.paid`, `payment.captured`.
4. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.

DB: apply `razorpay_payment_links` via `supabase/schema.sql` or `cd web && node scripts/migrate-razorpay-payment-links.mjs`.

Full phased guide: [`razorpay-payment-links.md`](razorpay-payment-links.md).

**Commercial messaging (August 2026):** ₹299 for the **first 100 buyers**, **lifetime product access**, **60 Apply runs included**. Application-count **enforcement** is planned with tier infrastructure; until then access is binary `is_paid`. After unlock, complete **Profile** setup before Dashboard/Apply unlock.

**Legacy / support**

- Manual UPI + UTR claim remains a collapsed fallback on `/billing` when configured.
- Admin **Mark paid / unpaid** on Admin Center is the support override.
- Optional `ADMIN_NOTIFY_EMAIL` still used for legacy payment-claim alerts.

---

## 2. OpenAI (Apply pipeline)

1. Create an API key in the [OpenAI dashboard](https://platform.openai.com/).
2. Add to `web/.env.local`:

```bash
CHATGPT_API_KEY=sk-...
# or
OPENAI_API_KEY=sk-...
```

3. Model is fixed in code as **`gpt-4.1-mini`** (`web/src/lib/llm/openai.ts`).
4. Without a key, server Apply stages cannot run (Bridge/manual paste path may still apply for legacy flows).

Monitor token usage in the OpenAI dashboard as users grow (typical full Apply is on the order of tens of thousands of tokens / ~₹2–₹2.5).

---

## 3. Google Cloud (Drive + Docs)

See [`architecture.md`](architecture.md) §11. Summary:

1. Enable **Google Drive API** and **Google Docs API**. The Gmail API is no longer used — see §3a.
2. OAuth consent scopes (user Connect Google):
   - `drive.file`, `documents` — both non-sensitive-to-sensitive, neither *restricted*
   - Master Doc selection uses **Google Picker** (no `drive.readonly`)
3. Enable **Google Picker API** and create a Browser API key → `NEXT_PUBLIC_GOOGLE_API_KEY`
4. Web client origins + redirect: `…/api/auth/google/callback`

### Removing the Gmail scope (§3a)

The app used to request `gmail.compose` to create outreach drafts through the
API. Google classifies that as a **restricted** scope: publishing on it costs an
annual third-party security assessment. It bought nothing a compose link does
not, so it is gone — outreach opens in the user's own mail client
(`web/src/lib/emails/manual-send.ts`) and the app's own mail goes through Resend.

After deploying a build that no longer lists it, tidy the Cloud console:

1. **APIs & Services → Enabled APIs** → disable **Gmail API**.
2. **OAuth consent screen → Data access** → remove
   `.../auth/gmail.compose` (and `gmail.send` / `gmail.readonly` if present).
3. Existing users keep a stale grant until they reconnect. `getGoogleAuthUrl`
   already sends `prompt=consent` with `include_granted_scopes: false`, so the
   next Connect Google drops it. Nothing breaks in the meantime — the app never
   calls Gmail.

---

## 3b. Resend (the app's own mail)

Password resets, payment receipts and payment-claim alerts.

1. Create a Resend account and **verify the sending domain** (DKIM + SPF). An
   unverified domain means every send is rejected at delivery time.
2. Create an API key → `RESEND_API_KEY`.
3. Set `TRANSACTIONAL_FROM_EMAIL` to an address on that domain, e.g.
   `JobApp OS <noreply@jobappos.in>`. Optionally `TRANSACTIONAL_REPLY_TO`.
4. With no key the app reports `not_configured` and sends nothing — password
   reset tokens are still created, so an admin can hand the link over from
   Admin Center.

---

## 4. Local environment

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Create an account**.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres |
| `AUTH_SECRET` | Yes | Session cookie |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Yes | OAuth |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Yes for Picker | Browser key (Picker API) |
| `NEXT_PUBLIC_GOOGLE_APP_ID` | No | Cloud project number for Picker |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | Encrypt Google tokens |
| `CHATGPT_API_KEY` or `OPENAI_API_KEY` | Yes for Apply | OpenAI |
| `RESEND_API_KEY` | Yes for app email | Password resets, receipts, admin alerts |
| `TRANSACTIONAL_FROM_EMAIL` | With Resend | From address on the verified domain |
| `TRANSACTIONAL_REPLY_TO` | No | Reply-to for the app's own mail |
| `RESUME_MASTER_DOC_ID` / `COVER_LETTER_MASTER_DOC_ID` | No | Default master Docs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Yes for auto billing | Payment Links API |
| `RAZORPAY_WEBHOOK_SECRET` | Yes for auto unlock | Webhook HMAC |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | No | Default `299` |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | No | Launch offer label |
| `NEXT_PUBLIC_UPI_ID` | No | Legacy UPI fallback |
| `ADMIN_NOTIFY_EMAIL` | No | Legacy payment-claim alerts |
| `CRON_SECRET` | Recommended in prod | Cron auth |

Migrate payment links if needed: `cd web && node scripts/migrate-razorpay-payment-links.mjs`.

---

## 5. First-run checklist (in the app)

1. Sign up → complete **billing** if unpaid  
2. Open **Profile** (`/onboarding`)  
3. **Connect Google** (Drive + Docs — no mail permission is requested)  
4. Save required **profile** fields (full name, location, phone, LinkedIn) and sync **master resume**  
5. Optionally sync master cover letter (enables cover letter on Apply)  
6. **Optional:** Install JobApp Bridge (not required when OpenAI key is set)  
7. Explore **Dashboard** — fresh-jobs banner, metrics date filter (**IST**)  
8. **Apply** — optional contact finder guide (LinkedIn → Mailmeteor)  

Dashboard and Apply stay locked until Google + profile + master resume are ready. Profile settings remain editable anytime.

Dashboard metrics (default last **30 days**, IST day bounds): Total applications, This week, Outreach emails, Companies contacted.

### Master resume Google Doc

Headers: `WORK EXPERIENCE`, `PROJECTS` (optional), `SKILLS`, `EDUCATION`. Bullets as list items; skill lines `Category: a, b, ...`.

---

## 6. Chrome extension (JobApp Bridge) — optional

Use when you want ChatGPT UI automation instead of (or in addition to) server OpenAI.

**Load unpacked:** `extension/` → Options: App URL + token from Privacy & Settings.

Details: [`extension/README.md`](../extension/README.md).

---

## 7. Quick Apply smoke test

1. Open **Apply** — company, role, JD (≥ 50 chars)  
2. Optionally add 2–3 contacts (use the in-form finder guide)  
3. Start auto-apply → `/pipeline/[id]`  
4. Confirm stages complete; PDFs downloadable; Outreach tab opens each email in a compose window with the PDFs offered as downloads  

---

## 8. Hosting (Vercel)

1. Deploy `web/`  
2. Production env: pooler `DATABASE_URL`, OpenAI key, production `NEXT_PUBLIC_APP_URL` + Google redirect, Razorpay live keys + webhook URL/secret, `AUTH_SECRET`, `CRON_SECRET`  
3. Confirm `/api/health`  
4. Set `RESEND_API_KEY` + `TRANSACTIONAL_FROM_EMAIL`, then trigger a password reset to confirm delivery  

### Google brand verification notes

- Homepage (`/`) must publicly describe what JobApp OS does (job application automation; Google Drive/Docs for resume files).  
- Privacy Policy URL on the site must **exactly match** the OAuth consent screen URL.  
- Privacy Policy includes Google Limited Use / API Services User Data Policy language.  

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Apply fails: API key missing | Set `CHATGPT_API_KEY` / `OPENAI_API_KEY` |
| OpenAI 429 / quota | Check OpenAI billing & rate limits |
| Outreach without PDFs | Ensure Drive upload completed; the run flags it if the PDFs were still uploading |
| Resume fails: keyword coverage below 70% | Master must contain those JD tools/terms; repair rewrites bullets/skills without changing wrap lines |
| Resume layout / second page | Master bullets define wrap line counts; do not pad past master width |
| `No active template` | `node scripts/seed-prompt-templates.mjs` (resume: `activate-resume-v30.mjs` if needed) |
| `Missing DATABASE_URL` / `AUTH_SECRET` | Add to `.env.local` / Vercel |
| `redirect_uri_mismatch` | Match Google redirect to production URL |
| Bridge 401 | Rotate token; reload extension |
| DB timeout on Vercel | Use Transaction pooler `:6543` |
