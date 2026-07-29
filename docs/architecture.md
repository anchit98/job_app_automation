# JobApp OS — Architecture

> Companion to [`problemstatement.md`](problemstatement.md). Describes the **current shipped system** as of July 2026.

---

## 0. Executive Summary

**JobApp OS** is a hosted, multi-user web app that turns a pasted job description (plus optional contacts) into a tracked application package: tailored resume, cover letter, cold emails, Gmail drafts, and follow-ups. ChatGPT is the LLM, used via paste or the **JobApp Bridge** Chrome extension — no API keys needed.

**Design pillars:**

1. **~$0 beyond ChatGPT Go** — Supabase free tier, Vercel Hobby, Google Drive free quota  
2. **The user *is* the LLM API** — every prompt is pasted into ChatGPT (or automated by Bridge); no rate limits  
3. **Structured contracts** — every paste-back is Zod-validated; malformed responses get a repair prompt  
4. **Draft-only outbound** — Gmail drafts, never auto-send  
5. **Multi-tenant** — email/password signup; every row scoped to `user_id`

**Not in scope:** auto-submit to LinkedIn, auto-send email, interview scheduling, salary tooling, LLM API keys.

---

## 1. Stack

### Application
- **Next.js 16.2** (App Router, React 19, Server Actions, Turbopack dev)
- **Tailwind CSS 4** + custom design tokens (DESIGN.md "Command Precision")
- **Zod 4** for validation

### Data & Auth
- **Supabase Postgres** (remote; connection via `postgres` npm package)
- **Email/password auth** — `bcryptjs` passwords, `jose` JWT session cookie (`applyforge_session`, 30 days)
- **`users` + `sessions`** tables; middleware gates all non-public routes
- **Multi-tenant** — `profiles`, `applications`, `pipelines`, `google_tokens`, `extension_tokens`, etc. all keyed by `user_id`
- **Google OAuth** — Drive + Gmail scopes; separate from app login

### LLM (Paste-to-GPT)
- **Prompt Composer** — assembles prompt from template + context
- **Paste-Back Validator** — strips fences, extracts JSON, Zod validates
- **Repair Prompt Generator** — on validation fail, emits a fix prompt
- **Prompt Library** — versioned templates in `prompt_templates` table

### Outbound
- **Gmail API** — `gmail.compose` for drafts; `gmail.readonly` for sent-mail thread lookup; `gmail.send` for password-reset emails from the admin Google account
- **Google Drive + Docs API** — master resume/cover sync; generated artifact storage

### Extension
- **JobApp Bridge** (Chrome MV3) — opens ChatGPT, pastes prompt, captures response, POST back, closes tab; loops through pipeline stages

### Hosting
- **Vercel** (production) or `npm run dev` (local)
- No Redis, no SQLite, no Sentry

---

## 2. System Context

```mermaid
flowchart LR
    User(("User"))
    subgraph Browser
        UI["Next.js UI"]
        Ext["JobApp Bridge (MV3)"]
    end
    subgraph ChatGPT[chatgpt.com]
        GPT["ChatGPT Go"]
    end
    subgraph Vercel["Vercel / Local"]
        API["Server Actions + Route Handlers"]
        Middleware["Auth Middleware"]
    end
    subgraph Supabase
        PG[("Postgres")]
    end
    subgraph Google["Google Cloud"]
        Drive[("Drive + Docs")]
        Gmail["Gmail API"]
    end

    User --> UI
    Ext --> GPT
    GPT --> Ext
    Ext --> API
    UI --> API
    Middleware --> API
    API --> PG
    API --> Drive
    API --> Gmail
```

---

## 3. Auth

| Layer | Mechanism |
|---|---|
| Signup / login | `bcryptjs` + `users` table; forms at `/signup`, `/login` |
| Session | JWT (`jose`) in `applyforge_session` httpOnly cookie; `sessions` table in Postgres |
| Middleware | `middleware.ts` verifies JWT on every non-public route; redirects to `/login` |
| Multi-tenant | Every query helper resolves `user_id` from session (`currentUserId()`) |
| Password recovery | Forgot-password email with one-time token (`password_reset_tokens`); `/reset-password` |
| Forced reset | `users.must_reset_password` gates into `/reset-password-required` until changed |
| Admin | `users.is_admin`; first signup on empty DB is admin; `/admin-center` for user ops |
| Google OAuth | Separate — grants Drive + Gmail access; tokens encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY` |

First signup claims orphaned legacy singleton rows (if any).

---

## 4. Data Model (key tables)

| Table | Scope | Purpose |
|---|---|---|
| `users` | PK `id` | App accounts (`is_admin`, `must_reset_password`, `is_paid`, `paid_at`) |
| `sessions` | FK `user_id` | Active sessions |
| `password_reset_tokens` | FK `user_id` | One-time email reset links |
| `password_reset_requests` | FK `user_id` | Recovery request audit |
| `payment_claims` | FK `user_id` | Manual UPI payment reviews |
| `profiles` | PK `user_id` | Name, links, avatar, setup flags |
| `master_resume` | PK `user_id` | Resume JSON + Doc sync |
| `master_cover_letter` | PK `user_id` | Cover letter Doc sync |
| `google_tokens` | PK `user_id` | Encrypted OAuth tokens |
| `extension_tokens` | PK `user_id` | JobApp Bridge bearer |
| `applications` | FK `user_id` | JD + status + notes |
| `contacts` | FK `application_id` | Recruiter contacts |
| `resume_versions` | FK `application_id` | Generated resumes |
| `cover_letter_versions` | FK `application_id` | Generated cover letters |
| `emails` | FK `application_id` | Cold emails + Gmail drafts |
| `follow_ups` | FK `application_id` | Scheduled follow-up prompts |
| `prompt_runs` | FK `user_id` | Prompt ↔ response ledger |
| `prompt_templates` | — | Versioned templates |
| `pipeline_runs` | FK `user_id` | Quick Apply pipeline state |
| `audit_log` | FK `user_id` | Event log |

Schema: [`supabase/schema.sql`](../supabase/schema.sql).

---

## 5. Quick Apply Pipeline

### Stages

```
create_application → jd_parse → resume → cover_letter
  → save_contacts → cold_email → gmail_drafts
```

### Required form fields

- **Job description** (≥ 50 characters)
- **Company** and **Role** (non-empty; validated in UI + Zod)

### Contacts are optional

- **With contacts**: all 7 stages run; cold email + Gmail drafts produce outputs
- **Without contacts**: `save_contacts`, `cold_email`, `gmail_drafts` are marked **skipped**
- Pipeline completes after cover letter when contacts are empty

### Stage statuses

`pending | running | awaiting_chatgpt | completed | failed | skipped`

### ChatGPT loop (per stage)

1. Prompt Composer builds the prompt
2. Prompt is exported → ChatGPT (via Bridge or manual paste)
3. Response pasted back → Zod validates → artifact saved
4. If invalid → repair prompt issued → user retries
5. On completion → next stage

### Concurrency

- One active pipeline per user at a time; additional starts are **queued**
- Atomic `UPDATE … WHERE status = 'pending'` prevents double-claims
- `PipelineKeeper` (client) polls; backs off when tab is idle/hidden

---

## 6. Dashboard Setup Guide

After signup, the dashboard shows an interactive **4-step accordion** (minimizable to a floating pill):

1. **Google Cloud Console** — one-time OAuth env setup  
2. **Connect Google** — link user's Google account  
3. **Profile & master docs** — name, headline, sync resume/cover Docs  
4. **Install JobApp Bridge** — download zip or load unpacked  

Progress is tracked with a bar and per-step checkmarks. Minimize state is persisted to `profiles.setup_guide_collapsed`; **Privacy & Settings** can reopen it.

### Dashboard layout

- Profile header with **Start Quick Apply** + **Update Profile**
- Full-width **pipeline metrics** grid + **Enqueue due follow-ups**
- No shortcut tiles for Apply / Jobs / Profile / Settings (those live in the header / Me menu)

---

## 7. UI & Theme

- **"Command Precision"** design language (LinkedIn-ish, see `DESIGN.md`)  
- Brand: **JobApp OS** logo (`public/brand/jobapp-os-logo.png`)  
- **Light + dark + system** theme; cookie `applyforge_theme`; boot script avoids flash  
- **Me dropdown** — avatar, View Profile, Privacy & Settings, Privacy Policy, Terms, theme, Sign out  
- **Profile avatar** — upload on Profile page; stored in `profiles.avatar_data/avatar_mime`; served at `/api/profile/avatar`  
- **Desktop nav**: Dashboard · Apply · Jobs (+ Admin) + Me avatar  
- **Mobile nav**: fixed bottom tabs (Dashboard / Apply / Jobs / Admin or Billing) + compact top header  
- **Jobs** — desktop table; mobile cards with aligned meta rows  
- **Dashboard metrics** — fixed label / value / hint bands so numbers align on mobile  
- **Search applications** — on `/applications` (Jobs)  
- **Legal footer** — Privacy Policy + Terms (desktop / public pages); Back control on legal pages  
- Client router cache (`staleTimes`) keeps visited pages instant on revisit  
- **PageLoader** — branded centered spinner on route transitions

### Billing & payment review

- Unpaid users gated to `/billing` (admins treated as paid)  
- Pay via UPI ID, **Show QR** modal, or `upi://` deep link  
- Submit UTR → `payment_claims`; email alert via admin Gmail (`gmail.send`)  
- Email CTA → `/review-payment/[signed-token]` (7-day JWT) for approve/reject on phone  
- Admin Center lists pending claims + user ⋮ menu (mark paid, admin role, reset password, delete)

---

## 8. App Routes

| Route | Purpose |
|---|---|
| `/` | Redirect to `/dashboard` or `/login` |
| `/login`, `/signup` | Auth |
| `/forgot-password`, `/reset-password` | Email password recovery |
| `/reset-password-required` | Forced password change after admin create / reset |
| `/dashboard` | Dashboard, metrics, follow-ups, setup guide |
| `/apply` | Quick Apply form |
| `/applications` | Jobs list + search |
| `/applications/[id]` | Application workspace (contacts, versions, email, notes) |
| `/pipeline/[id]` | Pipeline progress UI |
| `/onboarding` | Profile, avatar, master resume/cover |
| `/prompts` | Prompts inbox |
| `/settings` | Privacy & Settings (password, extension, account delete) |
| `/billing` | Manual UPI + QR paywall |
| `/review-payment/[token]` | Signed mobile payment review |
| `/admin-center` | Admin user + payment management |
| `/privacy-policy` | Privacy Policy |
| `/terms` | Terms of Service |
| `/health` | Google / prompt / DB health |
| `/demo` | Paste-flow sandbox |
| `/api/health` | Public readiness check |
| `/api/auth/google/*` | Google OAuth start + callback |
| `/api/extension/*` | Bridge pending / paste-back / report-error |
| `/api/profile/avatar` | User avatar image |
| `/api/cron/*` | Tick pipelines, enqueue follow-up prompts |

---

## 9. Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres (pooler `:6543` for Vercel) |
| `AUTH_SECRET` | Yes | Signs session JWTs + payment-review tokens |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (production must not be localhost) |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | OAuth secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must match Google Console (`…/api/auth/google/callback`) |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | Encrypts stored Google tokens |
| `NEXT_PUBLIC_UPI_ID` | Yes (paywall) | UPI VPA on billing |
| `NEXT_PUBLIC_PAYMENT_AMOUNT_INR` | No | Amount (default `499`) |
| `NEXT_PUBLIC_PAYMENT_PLAN_LABEL` | No | Plan label |
| `ADMIN_NOTIFY_EMAIL` | No | Payment alert recipients (else all admins) |
| `CRON_SECRET` | No | Bearer auth for `/api/cron/*` |
| `RESUME_MASTER_DOC_ID` | No | Default master resume Doc |
| `COVER_LETTER_MASTER_DOC_ID` | No | Default cover letter Doc |

---

## 10. Google Integration

### OAuth flow

1. User clicks **Connect Google** on Dashboard  
2. App redirects to Google consent (Gmail + Drive + Docs scopes)  
3. Google callback → app exchanges code → encrypts tokens → stores in `google_tokens` (per user)  
4. Tokens refresh transparently; `invalid_grant` triggers a "Reconnect Google" banner  

**Shared OAuth app config** (one client ID/secret for the product). Each user stores **their own** tokens. Admin Gmail send (password reset + payment alerts) uses a connected **admin** account with `gmail.send`.

### Drive file layout

```
Job Application Automation/
├── {Company} - {Role}/
│   ├── Resume_v1.pdf / .docx
│   └── Cover_Letter_v1.pdf / .docx
└── Master Resume/
    └── (synced from user's Doc)
```

### Gmail

- **Draft-only for outreach** (scope `gmail.compose`)
- **Password reset + payment-claim emails** use `gmail.send` from a connected admin Google account
- Cold email → Gmail draft with resume PDF attachment
- Follow-up → Gmail draft

---

## 11. Migrations & Scripts

| Script | Purpose |
|---|---|
| `supabase/schema.sql` | Full schema (new deploys) |
| `web/scripts/migrate-auth-multitenant.mjs` | Adds `users`, `sessions`, scopes existing tables (v44) |
| `web/scripts/migrate-setup-guide.mjs` | `setup_console_done_at`, `setup_guide_collapsed` (v45) |
| `web/scripts/migrate-profile-avatar.mjs` | `avatar_data`, `avatar_mime` (v46) |
| `web/scripts/migrate-admin-auth.mjs` | `is_admin`, `must_reset_password`, password reset tables (v47) |
| `web/scripts/migrate-manual-payments.mjs` | `is_paid`, `paid_at`, `payment_claims` (v48) |
| `web/scripts/promote-admin-user.mjs` | Set `is_admin` for an email |
| `web/scripts/seed-prompt-templates.mjs` | Loads `_prompt_templates.json` into `prompt_templates` |
| `web/scripts/pack-extension-zip.mjs` | Packs `extension/` → `public/downloads/jobapp-bridge.zip` |
| `web/scripts/inspect-payment-email.mjs` | Debug payment claim + Gmail notify state |
| `web/scripts/print-payment-review-url.ts` | Print mobile review URL for latest pending claim |

---

## 12. Change Log

- **v1.4** — **Follow-up threading.** Follow-up Gmail drafts now reply in the original cold-email thread (`In-Reply-To` + `threadId`); PDF attachments skipped for follow-ups. Gmail `gmail.readonly` scope added for sent-message lookup when drafts are already sent. `emails.gmail_thread_id` + `gmail_rfc_message_id` columns. Auto-advance to `email_sent` on any cold-email draft creation. Follow-up UI temporarily hidden.
- **v1.3** — **Mobile-ready UI** (bottom tabs, card Jobs list, aligned metrics). **Legal pages** + footer. Billing **QR** + **phone payment review** links. Admin user **⋮** actions menu. Production OAuth/env guidance tightened.
- **v1.2** — **Manual UPI paywall.** Unpaid users gated to `/billing`; submit UTR for admin approval. Admins can approve/reject claims or mark paid / revoke access.
- **v1.1** — **JobApp OS branding**, Admin Center, email password recovery, forced resets. Quick Apply requires company + role. Dashboard simplified (metrics + follow-ups; Update Profile CTA). Header search only on Jobs. Privacy & Settings rename. Gmail `gmail.send` for reset emails.
- **v1.0** — **Multi-user hosted deploy.** Email/password auth, `user_id` scoping, Supabase Postgres, Vercel-ready. Dashboard setup guide with minimize/pill. Optional contacts in Quick Apply (cold email + Gmail skipped when empty). Theme (light/dark/system). Profile avatar upload. Me dropdown. Client router caching for instant revisits.
- **v0.5** — **Local-first pivot.** Dropped Supabase + app login in favour of SQLite.
- **v0.4** — Removed Upstash Redis.
- **v0.3** — Google Drive replaces Cloudflare R2. Mailmeteor paste-back replaces discovery chains. Gmail API replaces SMTP.
- **v0.2** — ChatGPT Go paste-to-GPT flow replaces free LLM APIs. Prompt Composer + Paste-Back Bridge. Phase 8 Chrome extension.
- **v0.1** — Initial architecture from problem statement.
