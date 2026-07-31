# JobApp OS | Job Application Automation

**JobApp OS** turns a pasted job description into a tracked application package: tailored resume, cover letter, optional cold emails, Gmail drafts, and follow-ups.

Generations run **server-side with OpenAI (`gpt-4.1-mini`)** by default. The optional **JobApp Bridge** Chrome extension remains available as a ChatGPT paste fallback.

Hosted multi-user app: **Next.js 16** + **Supabase Postgres** + **Google Drive/Gmail** + **Vercel**.

---

## What it does

1. **Sign up / sign in** — email + password; sessions scoped per user  
2. **Manual UPI billing** — unpaid users land on `/billing`; launch offer **₹299** (first 100 buyers messaging): **lifetime access** + **60 applications included**  
3. **Dashboard** — setup guide, **fresh LinkedIn jobs** banner, date-filtered metrics, recent applications, quick actions  
4. **Quick Apply** — paste JD + company + role (contacts optional) → OpenAI pipeline; in-app guide to find emails via LinkedIn + [Mailmeteor](https://mailmeteor.com/tools/linkedin-email-finder)  
5. **Tracker (Jobs)** — applications, contacts, versions, notes  
6. **Gmail drafts** — created only after Drive PDFs are ready (attachments included)  
7. **Follow-ups** — enqueue draft prompts (never auto-send)  
8. **Admin Center** — users, paid access, payment claims  
9. **Marketing site** — Insider tips, FAQ, launch pricing  

### Quick Apply pipeline

```
create_application
  → jd_parse          (OpenAI; can be skipped)
  → resume            (OpenAI + Docs/Drive PDF)
  → cover_letter      (OpenAI + Docs/Drive PDF; optional skip)
  → save_contacts     (skipped if no contacts)
  → cold_email        (OpenAI; skipped if no contacts)
  → wait for Drive PDFs (resume ± cover ready)
  → gmail_drafts      (Gmail API; skipped if no contacts)
```

Emails are always **drafts** until you send them from Gmail.

---

## Repo layout

| Path | Purpose |
|---|---|
| `web/` | Next.js app (UI, Server Actions, APIs) |
| `extension/` | JobApp Bridge (Chrome MV3, optional) |
| `supabase/schema.sql` | Postgres schema for a fresh project |
| `docs/` | Problem statement, architecture, setup, edge cases |
| `DESIGN.md` | UI design tokens (“Command Precision”) |

---

## Quick start (local)

1. Follow **[docs/setup.md](docs/setup.md)** — Supabase, Google OAuth, `AUTH_SECRET`, OpenAI key, `.env.local`  
2. `cd web && npm install && npm run dev`  
3. Open [http://localhost:3000](http://localhost:3000) → **Sign up**  
4. Complete Dashboard setup (Connect Google, profile); Bridge optional if OpenAI key is set  

### Minimal env (`web/.env.local`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres (pooler `:6543` on Vercel) |
| `AUTH_SECRET` | Session JWT signing |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |
| `GOOGLE_OAUTH_*` | Client ID, secret, redirect URI |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Encrypts stored Google tokens |
| `CHATGPT_API_KEY` or `OPENAI_API_KEY` | OpenAI Apply generations |
| `NEXT_PUBLIC_UPI_ID` | UPI VPA on `/billing` |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | Default `299` |
| `ADMIN_NOTIFY_EMAIL` | Optional payment-claim alerts |

---

## App routes

| Route | Purpose |
|---|---|
| `/` | Marketing landing |
| `/login`, `/signup` | Auth |
| `/dashboard` | Metrics, fresh-jobs hack, recent apps, setup |
| `/apply` | Quick Apply (+ contact finder guide) |
| `/applications` | Jobs tracker |
| `/pipeline/[id]` | Live pipeline + PDF downloads |
| `/onboarding` | Profile & master docs |
| `/settings` | Privacy & Settings |
| `/billing` | UPI paywall (launch offer) |
| `/admin-center` | Admin |
| `/privacy-policy`, `/terms` | Legal |
| `/prompts`, `/health` | Inbox / ops |

---

## Docs

| Doc | Contents |
|---|---|
| [docs/setup.md](docs/setup.md) | Install, env, Google, OpenAI, billing, Vercel |
| [docs/architecture.md](docs/architecture.md) | Stack, OpenAI pipeline, dashboard, billing |
| [docs/problemstatement.md](docs/problemstatement.md) | Problem, goals, FRs |
| [docs/edgecases.md](docs/edgecases.md) | Failure modes & mitigations |
| [DESIGN.md](DESIGN.md) | Visual system |
| [extension/README.md](extension/README.md) | JobApp Bridge (optional) |

---

## Production (Vercel)

1. Deploy `web/`  
2. Set env (pooler DB, production URL, Google redirect, OpenAI key, UPI, `AUTH_SECRET`)  
3. Confirm `/api/health`  
4. Admin: Connect Google with `gmail.send` for transactional email  

---

## Out of scope (by design)

- Auto-submit to LinkedIn / ATS  
- Auto-**send** outreach email (drafts only)  
- Automated LinkedIn scraping / bulk email enrichment APIs  
- Interview scheduling / offer tooling  
