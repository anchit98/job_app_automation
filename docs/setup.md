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
```

Prefer applying the full [`supabase/schema.sql`](../supabase/schema.sql) for new projects.

**Admin:** first signup on an empty `users` table becomes admin. Promote later with `node scripts/promote-admin-user.mjs <email>`.

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

**Note:** App login (`AUTH_SECRET` + `users`/`sessions`) is separate from **Connect Google** (Drive/Gmail). You need both for Quick Apply end-to-end.

---

## 4. First-run checklist (in the app)

After signup, Home shows an interactive **Setup guide**:

1. **Google Cloud Console** — one-time OAuth client / env (self-host / first deploy)  
2. **Connect Google** — link *your* Google account in the app  
3. **Profile & master docs** — name, avatar (optional), sync master resume / cover letter Docs  
4. **Install JobApp Bridge** — download zip from the guide or load `extension/` unpacked  

The guide can be **minimized** to a bottom-right pill; reopen from **Privacy & Settings** if needed.

Home itself focuses on **pipeline metrics** + **follow-ups**, with **Start Quick Apply** and **Update Profile** in the header card (no shortcut tile grid).

### Master resume Google Doc

Must contain uppercase headers: `WORK EXPERIENCE`, `PROJECTS` (optional), `SKILLS`, `EDUCATION`. Bullets as list items; skill lines `Category: a, b, ...`; unique bullet text.

---

## 5. Chrome extension (JobApp Bridge)

**Option A — from the Setup guide**  
Download `jobapp-bridge.zip` from Home / the guide (built into `web/public/downloads/` on `npm run build` / `prebuild`).

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
2. Set the same env vars (`DATABASE_URL` = **pooler** URI, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` = your Vercel URL, Google redirect = production callback).  
3. Add the Vercel origin + redirect URI in Google Cloud Console.  
4. Update `extension/manifest.json` host permissions if needed; set Options App URL to production; paste a token from the **hosted** Privacy & Settings page.  
5. Confirm readiness at `/api/health` — `auth_secret` and `database` must be `true`.

Missing `AUTH_SECRET` on Vercel causes login to fail with a server error.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Missing DATABASE_URL` / `AUTH_SECRET` | Add to `web/.env.local` (and Vercel env) |
| Login 500 on Vercel | Set `AUTH_SECRET`, redeploy; check `/api/health` |
| `No active template for …` | Run `node scripts/seed-prompt-templates.mjs` |
| `redirect_uri_mismatch` | Google redirect must match `GOOGLE_OAUTH_REDIRECT_URI` |
| `access_denied` on Google | Add your email under OAuth **Test users** |
| `invalid_grant` | Reconnect Google, or publish the OAuth app |
| DB timeout on Vercel | Use **Transaction pooler** URI (port 6543) |
| Bridge stuck / 401 | Rotate token in Settings; reload extension |
