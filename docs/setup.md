# Setup Guide — JobApp OS

Multi-user hosted app. **Metadata** lives in **Supabase Postgres**. **Files** live in **Google Drive**. ChatGPT is used via paste or **JobApp Bridge**.

Brand in the UI: **JobApp OS**.

---

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query → paste and run [`supabase/schema.sql`](../supabase/schema.sql).
3. **Project Settings → Database** → copy the connection string:
   - Local / long-running Node: **Direct** or **Session** URI (port `5432`)
   - Vercel / serverless: **Transaction** pooler URI (port `6543`)
4. Seed prompt templates (after `DATABASE_URL` is set):

```bash
cd web
# PowerShell: $env:DATABASE_URL="postgresql://..."
node scripts/seed-prompt-templates.mjs
```

### Existing databases (migrations)

If you already have a DB from an older deploy, run these once (they are idempotent):

```bash
cd web
node scripts/migrate-auth-multitenant.mjs   # users, sessions, user_id scoping
node scripts/migrate-setup-guide.mjs       # setup guide flags
node scripts/migrate-profile-avatar.mjs    # avatar columns
node scripts/migrate-admin-auth.mjs        # is_admin, must_reset_password, password reset tables
node scripts/migrate-manual-payments.mjs   # is_paid, payment_claims (UPI paywall)
```

Prefer applying the full [`supabase/schema.sql`](../supabase/schema.sql) for new projects.

**Admin:** first signup on an empty `users` table becomes admin. Promote later with `node scripts/promote-admin-user.mjs <email>`.

### Manual UPI paywall

New signups land on `/billing` until an admin approves payment. Set:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_UPI_ID` | Your UPI VPA (e.g. `name@okaxis`) |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | Amount shown (default `499`) |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | Label on paywall |

Existing users are marked paid by the migration so current accounts keep access.

Payment-claim emails include a **Review on phone** link (`/review-payment/...`) — a signed mobile page to approve or reject without opening Admin Center. Links expire after 7 days.

---

## 2. Google Cloud (Gmail + Drive + Docs)

See [`architecture.md`](architecture.md) § Integration Setup for the full walkthrough. Summary:

1. Create project → enable **Gmail API**, **Google Drive API**, and **Google Docs API**.
2. **OAuth consent screen** (External) → add scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/documents`
3. Add your email as a **Test user** (while the app is in Testing).
4. **Credentials** → **OAuth client ID** → **Web application**:
   - Origins: `http://localhost:3000` (add production URL later)
   - Redirect: `http://localhost:3000/api/auth/google/callback`

### Gmail send (password recovery + payment-claim alerts)

The app sends real email via the **admin’s connected Google account** using `gmail.send`.

**In Google Cloud Console, confirm:**

1. **APIs & Services → Library** → **Gmail API** is **Enabled**.
2. **APIs & Services → OAuth consent screen → Scopes** includes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.compose`
3. If the app is still in **Testing**, your admin Google account email is listed under **Test users**.
4. After adding `gmail.send` (or if Connect Google was done before it existed), the admin must **Disconnect Google** then **Connect Google** again in JobApp OS so the new scope is granted and stored in `google_tokens.scope`.

**In JobApp OS:**

1. Sign in as an **admin**.
2. Complete **Connect Google** (Dashboard setup guide) with the Gmail inbox you want alerts to come *from*.
3. Optional env: `ADMIN_NOTIFY_EMAIL=you@gmail.com` (comma-separated). If unset, all admin account emails are notified when someone submits a UPI payment claim.

Payment claims still succeed even if email fails (check server logs / audit log).

---

## 3. Local environment

```bash
cd web
# Create .env.local (there is no committed .env.example — copy the table below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Create an account**.

Generate secrets:

```bash
# AUTH_SECRET and GOOGLE_TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection string |
| `AUTH_SECRET` | Yes | Signs the `applyforge_session` cookie |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` for local |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must match Google Console |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | Encrypts Google tokens in the DB |
| `RESUME_MASTER_DOC_ID` | No | Default master resume Google Doc ID |
| `COVER_LETTER_MASTER_DOC_ID` | No | Default master cover-letter Doc ID |
| `NEXT_PUBLIC_UPI_ID` | Yes (for paywall) | Your UPI VPA shown on `/billing` |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | No | Amount on paywall (default `499`) |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | No | Plan label (default `JobApp OS access`) |
| `ADMIN_NOTIFY_EMAIL` | No | Payment-claim alert recipients (comma-separated). Defaults to all admin emails |
| `CRON_SECRET` | Recommended in prod | Bearer token for `/api/cron/*` |

**Note:** App login (`AUTH_SECRET` + `users`/`sessions`) is separate from **Connect Google** (Drive/Gmail). You need both for Quick Apply end-to-end.

QR asset for billing: `web/public/billing/upi-qr.png` (Show QR on `/billing`).

---

## 4. First-run checklist (in the app)

After signup, Dashboard shows an interactive **Setup guide**:

1. **Google Cloud Console** — one-time OAuth client / env (self-host / first deploy)  
2. **Connect Google** — link *your* Google account in the app  
3. **Profile & master docs** — name, avatar (optional), sync master resume / cover letter Docs  
4. **Install JobApp Bridge** — download zip from the guide or load `extension/` unpacked  

The guide can be **minimized** to a bottom-right pill; reopen from **Privacy & Settings** if needed.

Dashboard itself focuses on **pipeline metrics** + **follow-ups**, with **Start Quick Apply** and **Update Profile** in the header card (no shortcut tile grid).

### Master resume Google Doc

Must contain uppercase headers: `WORK EXPERIENCE`, `PROJECTS` (optional), `SKILLS`, `EDUCATION`. Bullets as list items; skill lines `Category: a, b, ...`; unique bullet text.

---

## 5. Chrome extension (JobApp Bridge)

**Option A — from the Setup guide**  
Download `jobapp-bridge.zip` from Dashboard / the guide (built into `web/public/downloads/` on `npm run build` / `prebuild`).

**Option B — load unpacked**

1. `chrome://extensions` → Developer mode → **Load unpacked** → select repo `extension/`  
2. **Privacy & Settings** → copy extension token  
3. Extension **Options**: App URL `http://localhost:3000` + token → Save  
4. Reload the JobApp OS tab — status should show extension detected  

After code changes to `extension/`, click **Reload** on the extension card.

Details: [`extension/README.md`](../extension/README.md).

---

## 6. Quick Apply smoke test

1. Open **Quick Apply**  
2. Enter **Company** and **Role** (required)  
3. Paste a JD (≥ ~50 characters)  
4. **Contacts are optional** — if empty, cold email + Gmail drafts are skipped  
5. Start auto-apply → watch `/pipeline/[id]`  
6. With Bridge installed, ChatGPT tabs open and complete stages automatically  

---

## 7. Hosting (Vercel)

1. Deploy the `web/` directory.  
2. Set env vars for **Production**:
   - `DATABASE_URL` = **Transaction pooler** URI (port `6543`)
   - `AUTH_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`
   - `NEXT_PUBLIC_APP_URL` = `https://YOUR_DOMAIN` (**not** localhost)
   - `GOOGLE_OAUTH_REDIRECT_URI` = `https://YOUR_DOMAIN/api/auth/google/callback`
   - `NEXT_PUBLIC_UPI_ID` (+ optional amount / plan label)
   - `ADMIN_NOTIFY_EMAIL` (recommended so alerts go to your preferred inbox)
   - `CRON_SECRET` (recommended)
3. Google Cloud Console → OAuth Web client:
   - Authorized origin: `https://YOUR_DOMAIN`
   - Authorized redirect: `https://YOUR_DOMAIN/api/auth/google/callback`
4. Redeploy after env changes. Confirm `/api/health` — `auth_secret` and `database` must be `true`.
5. Admin: **Connect Google** with `gmail.send` so payment + password emails work.
6. JobApp Bridge Options: production App URL + token from Privacy & Settings.

Missing or localhost `NEXT_PUBLIC_APP_URL` / redirect causes `redirect_uri_mismatch` or redirects to localhost after Google connect.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Missing DATABASE_URL` / `AUTH_SECRET` | Add to `web/.env.local` (and Vercel env) |
| Login 500 on Vercel | Set `AUTH_SECRET`, redeploy; check `/api/health` |
| `No active template for …` | Run `node scripts/seed-prompt-templates.mjs` |
| `redirect_uri_mismatch` | Google redirect must match production `GOOGLE_OAUTH_REDIRECT_URI` |
| Google connect lands on localhost | Set production `NEXT_PUBLIC_APP_URL` + redirect; redeploy |
| Payment email went to wrong inbox | Set `ADMIN_NOTIFY_EMAIL` on Vercel; check admin Gmail Sent |
| `access_denied` on Google | Add email under OAuth **Test users**, or publish the app |
| `invalid_grant` | Reconnect Google, or publish the OAuth app |
| Admin email: needs `gmail.send` | Disconnect → Connect Google as admin after scope is added |
| DB timeout on Vercel | Use **Transaction pooler** URI (port 6543) |
| Bridge stuck / 401 | Rotate token in Settings; reload extension |
