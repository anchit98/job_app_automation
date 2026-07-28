# JobApp OS | Web App

Next.js 16.2 (App Router, React 19, Turbopack) application for **JobApp OS**.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On a phone on the same network, use the LAN URL printed by Next.js (e.g. `http://192.168.x.x:3000`).

## Environment

See [`docs/setup.md`](../docs/setup.md) for all required env vars (`DATABASE_URL`, `AUTH_SECRET`, Google OAuth, UPI paywall, etc.).

## Notable routes

| Route | Purpose |
|---|---|
| `/dashboard` | Home — metrics, follow-ups, setup guide |
| `/apply` | Quick Apply (company + role + JD required) |
| `/applications` | Jobs (desktop table / mobile cards) |
| `/billing` | UPI + QR paywall |
| `/review-payment/[token]` | Signed mobile payment approve/reject |
| `/settings` | Privacy & Settings |
| `/admin-center` | Admins only (⋮ user actions) |
| `/privacy-policy`, `/terms` | Legal |

## Mobile UI

- Bottom tab navigation on small screens  
- Compact header + Me menu (includes Privacy / Terms)  
- Safe-area / viewport support  
- Aligned metric cards and full-width primary actions on phone  

## Build & Deploy

```bash
npm run build   # also packs the JobApp Bridge extension zip
npm start
```

Deploy the `web/` directory to Vercel. Use the Supabase **Transaction pooler** URI for `DATABASE_URL` in serverless. Set production `NEXT_PUBLIC_APP_URL` and Google redirect to the Vercel domain (not localhost).
