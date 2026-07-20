# Setup Guide

Single-user app. **App metadata** lives in **Supabase Postgres**. **Files** live in **Google Drive**. ChatGPT is used via paste / JobApp Bridge extension.

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query → paste and run [`supabase/schema.sql`](../supabase/schema.sql).
3. **Project Settings → Database** → copy the connection string:
   - Local / long-running Node: **Direct** or **Session** URI (port `5432`)
   - Vercel / serverless: **Transaction** pooler URI (port `6543`)
4. Seed prompt templates (from this machine, after `DATABASE_URL` is set):

```bash
cd web
# Ensure scripts/_prompt_templates.json exists (already in repo if you pulled latest)
set DATABASE_URL=postgresql://...   # PowerShell: $env:DATABASE_URL="..."
node scripts/seed-prompt-templates.mjs
```

## 2. Google Cloud (Gmail + Drive)

See [`architecture.md`](architecture.md) §10 for the full walkthrough. Summary:

1. Create project → enable **Gmail API**, **Google Drive API**, and **Google Docs API**.
2. **OAuth consent screen** (External) → add scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/documents`
3. Add your email as a **Test user**.
4. **Credentials** → **OAuth client ID** → **Web application**:
   - Origins: `http://localhost:3000` (add production URL later)
   - Redirect: `http://localhost:3000/api/auth/google/callback`

## 3. Local environment

```bash
cd web
cp .env.example .env.local
# Fill DATABASE_URL + Google OAuth + encryption key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Generate encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection string |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must match Google Console |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | Encrypts Google tokens in the DB |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` for local |
| `RESUME_MASTER_DOC_ID` | No | Default master resume Google Doc ID |

**Note:** Switching from SQLite to Supabase starts a **fresh** database. Re-connect Google, re-sync master docs, and re-create the extension token. Your old `web/data/app.db` is not auto-imported.

## 4. Chrome extension (JobApp Bridge)

1. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`
2. Settings in the app → copy token → Extension Options → App URL `http://localhost:3000` + token

## 5. First-run checklist

- [ ] Schema applied + prompt templates seeded
- [ ] Profile saved (`/onboarding`)
- [ ] Connect Google
- [ ] Master resume Google Doc synced
- [ ] Extension detected
- [ ] One Quick Apply smoke test

### Master resume Google Doc

Must contain uppercase headers: `WORK EXPERIENCE`, `PROJECTS` (optional), `SKILLS`, `EDUCATION`. Bullets as list items; skill lines `Category: a, b, ...`; unique bullet text.

## 6. Hosting (Vercel) — after local works on Supabase

1. Deploy `web/` to Vercel; set the same env vars (`DATABASE_URL` = **pooler** URI, `NEXT_PUBLIC_APP_URL` = your Vercel URL, Google redirect = production callback).
2. Add the Vercel origin + redirect URI in Google Cloud Console.
3. Update `extension/manifest.json` host permissions + content_scripts to include `https://your-app.vercel.app/*`, reload extension, set Options App URL to the Vercel URL, paste a token from the **hosted** Settings page.
4. There is still **no app login** — anyone with the URL can use the app. For personal use, keep the URL private or add auth later.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Missing DATABASE_URL` | Add it to `web/.env.local` |
| `No active template for …` | Run `node scripts/seed-prompt-templates.mjs` |
| `redirect_uri_mismatch` | Google redirect must match `GOOGLE_OAUTH_REDIRECT_URI` |
| `access_denied` on Google | Add your email under OAuth **Test users** |
| `invalid_grant` | Reconnect Google, or publish the OAuth app |
| DB connection timeout on Vercel | Use the **Transaction pooler** URI (port 6543) |
