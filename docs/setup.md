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

### Manual UPI paywall (launch offer)

New signups land on `/billing` until an admin approves payment.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_UPI_ID` | Your UPI VPA |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | Amount (default **`299`**) |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | Default: launch offer · 60 apps · lifetime access |

**Commercial messaging (August 2026):** ₹299 for the **first 100 buyers**, **lifetime product access**, **60 Apply runs included**. Application-count **enforcement** is planned with tier infrastructure; until then access is binary `is_paid`. After approval, complete **Profile** setup before Dashboard/Apply unlock.

Payment-claim emails include a **Review on phone** link (`/review-payment/...`, 7-day JWT).

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

## 3. Google Cloud (Gmail + Drive + Docs)

See [`architecture.md`](architecture.md) §11. Summary:

1. Enable **Gmail API**, **Google Drive API**, **Google Docs API**.
2. OAuth consent scopes:
   - `gmail.compose`, `gmail.send`, `gmail.readonly` (as used by the app)
   - `drive.readonly`, `drive.file`, `documents`
3. Web client origins + redirect: `…/api/auth/google/callback`
4. Admin must **Connect Google** with `gmail.send` for password + payment emails.

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
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | Encrypt Google tokens |
| `CHATGPT_API_KEY` or `OPENAI_API_KEY` | Yes for Apply | OpenAI |
| `RESUME_MASTER_DOC_ID` / `COVER_LETTER_MASTER_DOC_ID` | No | Default master Docs |
| `NEXT_PUBLIC_UPI_ID` | Yes for paywall | UPI VPA |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | No | Default `299` |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | No | Launch offer label |
| `ADMIN_NOTIFY_EMAIL` | No | Payment alerts |
| `CRON_SECRET` | Recommended in prod | Cron auth |

QR asset: `web/public/billing/upi-qr.png`.

---

## 5. First-run checklist (in the app)

1. Sign up → complete **billing** if unpaid  
2. Open **Profile** (`/onboarding`)  
3. **Connect Google** (Drive + Docs + Gmail)  
4. Save required **profile** fields (full name, location, phone, LinkedIn) and sync **master resume**  
5. Optionally sync master cover letter (enables cover letter on Apply)  
6. **Optional:** Install JobApp Bridge (not required when OpenAI key is set)  
7. Explore **Dashboard** — fresh-jobs banner, metrics date filter (**IST**)  
8. **Apply** — optional contact finder guide (LinkedIn → Mailmeteor)  

Dashboard and Apply stay locked until Google + profile + master resume are ready. Profile settings remain editable anytime.

Dashboard metrics (default last **30 days**, IST day bounds): Total applications, This week, Gmail drafts, Companies contacted.

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
4. Confirm stages complete; PDFs downloadable; Gmail drafts appear **with attachments** after Drive uploads finish  

---

## 8. Hosting (Vercel)

1. Deploy `web/`  
2. Production env: pooler `DATABASE_URL`, OpenAI key, production `NEXT_PUBLIC_APP_URL` + Google redirect, UPI, `AUTH_SECRET`, `CRON_SECRET`  
3. Confirm `/api/health`  
4. Admin Connect Google with `gmail.send`  

### Google brand verification notes

- Homepage (`/`) must publicly describe what JobApp OS does (job application automation; Drive/Docs/Gmail drafts).  
- Privacy Policy URL on the site must **exactly match** the OAuth consent screen URL.  
- Privacy Policy includes Google Limited Use / API Services User Data Policy language.  

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Apply fails: API key missing | Set `CHATGPT_API_KEY` / `OPENAI_API_KEY` |
| OpenAI 429 / quota | Check OpenAI billing & rate limits |
| Gmail drafts without PDFs | Ensure Drive upload completed; pipeline waits then fails clearly if not |
| Resume fails: keyword coverage below 70% | Master must contain those JD tools/terms; repair rewrites bullets/skills without changing wrap lines |
| Resume layout / second page | Master bullets define wrap line counts; do not pad past master width |
| `No active template` | `node scripts/seed-prompt-templates.mjs` (resume: `activate-resume-v30.mjs` if needed) |
| `Missing DATABASE_URL` / `AUTH_SECRET` | Add to `.env.local` / Vercel |
| `redirect_uri_mismatch` | Match Google redirect to production URL |
| Bridge 401 | Rotate token; reload extension |
| DB timeout on Vercel | Use Transaction pooler `:6543` |
