# JobApp OS | Web App

Next.js 16.2 (App Router, React 19, Turbopack) application for **JobApp OS**.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

See [`docs/setup.md`](../docs/setup.md) for all required env vars (`DATABASE_URL`, `AUTH_SECRET`, Google OAuth, etc.).

## Notable routes

| Route | Purpose |
|---|---|
| `/dashboard` | Home — metrics, follow-ups, setup guide |
| `/apply` | Quick Apply (company + role + JD required) |
| `/applications` | Jobs (header search only here) |
| `/settings` | Privacy & Settings |
| `/admin-center` | Admins only |

## Build & Deploy

```bash
npm run build   # also packs the JobApp Bridge extension zip
npm start
```

Deploy the `web/` directory to Vercel. Use the Supabase **Transaction pooler** URI for `DATABASE_URL` in serverless.
