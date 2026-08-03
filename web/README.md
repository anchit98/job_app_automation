# JobApp OS | Web App

Next.js 16.2 (App Router, React 19, Turbopack) application for **JobApp OS**.

Default Apply LLM: **OpenAI `gpt-4.1-mini`** (`src/lib/llm/openai.ts`). See [`docs/architecture.md`](../docs/architecture.md).

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

See [`docs/setup.md`](../docs/setup.md) for env vars: `DATABASE_URL`, `AUTH_SECRET`, Google OAuth, **`CHATGPT_API_KEY` / `OPENAI_API_KEY`**, UPI paywall, etc.

## Notable routes

| Route | Purpose |
|---|---|
| `/` | Marketing (tips, FAQ, launch pricing) |
| `/dashboard` | Metrics + date filter (IST), fresh-jobs banner, recent apps |
| `/apply` | Quick Apply + contact finder guide |
| `/pipeline/[id]` | Progress; waits for Drive PDFs before drafts |
| `/applications` | Jobs tracker |
| `/onboarding` | Profile (Google, fields, master docs; setup gate) |
| `/billing` | UPI paywall (₹299 launch offer copy) |
| `/settings` | Privacy & Settings |
| `/admin-center` | Admins |
| `/privacy-policy`, `/terms` | Legal |

## Product notes

- Setup gate: Google + profile (name, location, phone, LinkedIn) + master resume before Dashboard/Apply  
- Metrics: Total applications, This week, Gmail drafts, Companies contacted (URL date range; default 30d; **IST**)  
- Launch offer messaging: first 100 buyers, lifetime access, 60 apps included (metering TBD)  
- Cover letters: default off until master cover synced; no AI greeting/sign-off (template owns those)  
- Resumes: JD keywords via in-place replace; preserve line counts  
- Follow-ups: IST business days; drafts only  

## Build & Deploy

```bash
npm run build   # also packs the JobApp Bridge extension zip
npm start
```

Deploy `web/` to Vercel. Use Supabase **Transaction pooler** for `DATABASE_URL`. Set production URL, Google redirect, and OpenAI key.
