# JobApp OS | Job Application Automation

**JobApp OS** turns a pasted job description into a tracked application package: tailored resume, cover letter, optional cold emails, Gmail drafts, and follow-ups — with ChatGPT in the loop via paste or the **JobApp Bridge** Chrome extension.

Hosted multi-user app: **Next.js 16** + **Supabase Postgres** + **Google Drive/Gmail** + **Vercel**.

---

## What it does

1. **Sign up / sign in** — email + password; sessions scoped per user  
2. **Home setup guide** — Google Cloud Console → Connect Google → Profile & master docs → Install JobApp Bridge (minimizable to a floating pill)  
3. **Quick Apply** — paste a JD + **company** + **role** (contacts optional) → automated pipeline  
4. **JobApp Bridge** — opens ChatGPT, pastes prompts, posts replies back (no manual copy/paste)  
5. **Tracker (Jobs)** — applications, contacts, versions, notes; search bar on Jobs only  
6. **Follow-ups** — enqueue draft prompts on a schedule (never auto-send)  
7. **Admin Center** — admins manage users, forced password reset, email recovery links

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
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `…/api/auth/google/callback` |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Encrypts stored Google tokens |

---

## App routes

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Auth |
| `/forgot-password`, `/reset-password` | Password recovery via email link |
| `/dashboard` | Home — metrics, follow-ups, setup guide, Start Quick Apply / Update Profile |
| `/apply` | Quick Apply (JD + company + role required; contacts optional) |
| `/applications` | Jobs tracker (header search appears here only) |
| `/pipeline/[id]` | Live pipeline progress |
| `/onboarding` | Profile, avatar, master resume/cover Docs |
| `/settings` | Privacy & Settings — password, extension token / bridge |
| `/billing` | Manual UPI paywall (unpaid users only) |
| `/admin-center` | Admin-only user management + payment approvals |
| `/prompts` | Prompts inbox |
| `/health` | Ops / Google / DB status |
| `/api/health` | Public readiness JSON (`auth_secret`, `database`, …) |

Header: **Home · Quick Apply · Jobs** (+ **Admin Center** for admins) + **Me** menu (profile, Privacy & Settings, theme, sign out). Application search is shown **only on Jobs**.

---

## Docs

| Doc | Contents |
|---|---|
| [docs/setup.md](docs/setup.md) | Install, env, extension, Vercel |
| [docs/architecture.md](docs/architecture.md) | Stack, pipeline, auth, Google integration |
| [docs/problemstatement.md](docs/problemstatement.md) | Problem, goals, FRs |
| [docs/edgecases.md](docs/edgecases.md) | Failure modes & mitigations |
| [DESIGN.md](DESIGN.md) | Visual system |
| [extension/README.md](extension/README.md) | JobApp Bridge install & troubleshooting |

---

## Production (Vercel)

1. Deploy the `web/` directory  
2. Set the same env vars (pooler `DATABASE_URL`, production `NEXT_PUBLIC_APP_URL`, matching Google redirect, **`AUTH_SECRET`**)  
3. Confirm [https://your-app.vercel.app/api/health](https://your-app.vercel.app/api/health) shows `auth_secret` and `database` true  
4. Point JobApp Bridge Options at the production App URL + token from Settings  

---

## Out of scope (by design)

- Auto-submit to LinkedIn / ATS  
- Auto-**send** email (drafts only)  
- Unattended LLM calls without ChatGPT / Bridge  
- Interview scheduling / offer tooling  
