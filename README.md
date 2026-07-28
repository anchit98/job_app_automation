# JobApp OS | Job Application Automation

**JobApp OS** turns a pasted job description into a tracked application package: tailored resume, cover letter, optional cold emails, Gmail drafts, and follow-ups — with ChatGPT in the loop via paste or the **JobApp Bridge** Chrome extension.

Hosted multi-user app: **Next.js 16** + **Supabase Postgres** + **Google Drive/Gmail** + **Vercel**.

---

## What it does

1. **Sign up / sign in** — email + password; sessions scoped per user  
2. **Manual UPI billing** — unpaid users land on `/billing` (UPI ID + QR); admins approve claims (Admin Center or phone review link)  
3. **Home setup guide** — Google Cloud Console → Connect Google → Profile & master docs → Install JobApp Bridge (minimizable)  
4. **Quick Apply** — paste a JD + **company** + **role** (contacts optional) → automated pipeline  
5. **JobApp Bridge** — opens ChatGPT, pastes prompts, posts replies back (no manual copy/paste)  
6. **Tracker (Jobs)** — applications, contacts, versions, notes; search on Jobs  
7. **Follow-ups** — enqueue draft prompts on a schedule (never auto-send)  
8. **Admin Center** — users, paid access, payment claims, password reset, delete account (⋮ actions menu)  
9. **Legal** — Privacy Policy + Terms of Service (site footer / Me menu)

### Quick Apply pipeline

```
create_application
  → jd_parse          (ChatGPT; can be skipped)
  → resume            (ChatGPT)
  → cover_letter      (ChatGPT)
  → save_contacts     (skipped if no contacts)
  → cold_email        (ChatGPT; skipped if no contacts)
  → gmail_drafts      (Gmail API; skipped if no contacts)
```

Emails are always **drafts** until you send them from Gmail.

---

## Repo layout

| Path | Purpose |
|---|---|
| `web/` | Next.js app (UI, Server Actions, APIs) |
| `extension/` | JobApp Bridge (Chrome MV3) |
| `supabase/schema.sql` | Postgres schema for a fresh project |
| `docs/` | Problem statement, architecture, setup, edge cases |
| `DESIGN.md` | UI design tokens (“Command Precision”) |

---

## Quick start (local)

1. Follow **[docs/setup.md](docs/setup.md)** — Supabase schema + seed, Google OAuth, `AUTH_SECRET`, `.env.local`  
2. `cd web && npm install && npm run dev`  
3. Open [http://localhost:3000](http://localhost:3000) → **Sign up**  
4. Complete the Home setup guide (Connect Google, profile, extension)

### Minimal env (`web/.env.local`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres (use **pooler** `:6543` on Vercel) |
| `AUTH_SECRET` | Session JWT signing (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` (must be production URL on Vercel) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `…/api/auth/google/callback` (must match Google Console) |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Encrypts stored Google tokens |
| `NEXT_PUBLIC_UPI_ID` | UPI VPA on `/billing` |
| `ADMIN_NOTIFY_EMAIL` | Optional; payment-claim alert recipients |

---

## App routes

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Auth |
| `/forgot-password`, `/reset-password` | Password recovery via email link |
| `/dashboard` | Home — metrics, follow-ups, setup guide |
| `/apply` | Quick Apply (JD + company + role required) |
| `/applications` | Jobs tracker |
| `/pipeline/[id]` | Live pipeline progress |
| `/onboarding` | Profile, avatar, master resume/cover Docs |
| `/settings` | Privacy & Settings — password, extension, account delete |
| `/billing` | Manual UPI + QR paywall (unpaid users) |
| `/review-payment/[token]` | Mobile admin approve/reject (signed email link) |
| `/admin-center` | Admin user + payment management |
| `/privacy-policy`, `/terms` | Legal pages |
| `/prompts` | Prompts inbox |
| `/health` | Ops / Google / DB status |
| `/api/health` | Public readiness JSON |

**Desktop nav:** Home · Apply · Jobs (+ Admin) + Me menu.  
**Mobile:** bottom tab bar + Me menu; Jobs use card layout; metrics aligned for small screens.

---

## Docs

| Doc | Contents |
|---|---|
| [docs/setup.md](docs/setup.md) | Install, env, Google, billing, Vercel |
| [docs/architecture.md](docs/architecture.md) | Stack, pipeline, auth, billing, mobile UI |
| [docs/problemstatement.md](docs/problemstatement.md) | Problem, goals, FRs |
| [docs/edgecases.md](docs/edgecases.md) | Failure modes & mitigations |
| [DESIGN.md](DESIGN.md) | Visual system |
| [extension/README.md](extension/README.md) | JobApp Bridge install & troubleshooting |

---

## Production (Vercel)

1. Deploy the `web/` directory  
2. Set env vars — **pooler** `DATABASE_URL`, production `NEXT_PUBLIC_APP_URL`, matching `GOOGLE_OAUTH_REDIRECT_URI`, `AUTH_SECRET`, `NEXT_PUBLIC_UPI_ID`, optional `ADMIN_NOTIFY_EMAIL` / `CRON_SECRET`  
3. In Google Cloud Console add production **origin** + **redirect** (`…/api/auth/google/callback`)  
4. Confirm `/api/health` shows `auth_secret` and `database` true  
5. Admin: Connect Google with `gmail.send` for password + payment emails  
6. Point JobApp Bridge Options at the production App URL + token from Settings  

Common pitfall: leaving `NEXT_PUBLIC_APP_URL` / redirect on `localhost` causes `redirect_uri_mismatch` or post-OAuth redirects to localhost.

---

## Out of scope (by design)

- Auto-submit to LinkedIn / ATS  
- Auto-**send** email for outreach (drafts only; admin Gmail send is for recovery/payment alerts)  
- Unattended LLM calls without ChatGPT / Bridge  
- Interview scheduling / offer tooling  
