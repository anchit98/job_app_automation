# JobApp Bridge (Chrome MV3)

Optional Chrome extension that closes the AI loop via **ChatGPT paste**: paste prompt → wait for reply → POST back to the app.

> **Default Apply path (July 2026):** JobApp OS runs generations **server-side with OpenAI** (`gpt-4.1-mini`). Bridge is **not required** when `CHATGPT_API_KEY` / `OPENAI_API_KEY` is configured. Keep this extension for fallback, demos, or environments without an OpenAI key.

## Install (required once, if using Bridge)

1. Start the app: `npm run dev` in `web/` → http://localhost:3000
2. Open **Privacy & Settings** (or start a Quick Apply — a token is auto-created).
3. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select this `extension/` folder.
4. Extension **Options**:
   - App URL: `http://localhost:3000`
   - Paste the token from Privacy & Settings
   - Enabled: on → **Save**
5. Reload the JobApp OS tab. Status should show **extension detected**.

After code updates to this folder, click **Reload** on the extension card in `chrome://extensions`.

## How it works

1. **Quick Apply** (Bridge engine path) arms a short-lived server wake, then dispatches `jobapp-pending`.
2. Extension must `consume_wake` successfully before opening AI chat — refreshes and background polls cannot open a tab.
3. Legacy `GET /api/extension/pending` always returns `null` (stops older builds that polled on focus/refresh).
4. After the reply: paste-back → delete chat → close tab. The next pipeline stage arms + signals again.

**Required:** after updating this folder, click **Reload** on JobApp Bridge in `chrome://extensions`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Stuck on “Tailor resume” | Prefer server OpenAI path; or complete Privacy & Settings + reload extension |
| “Could not find AI input” | Stay logged into your AI chat account; reload extension; try a fresh AI chat tab |
| 401 on paste-back | Token mismatch — Rotate token in Privacy & Settings and paste into Options again |
| Claimed but never finishes | Wait 90s for auto-requeue, or Reload extension and refresh the pipeline page |

## Edge cases covered

- Missing extension → setup banner on pipeline page (Bridge path)
- DOM selector drift → multiple strategies + inject retry
- 5-minute response timeout → posts `partial: true`
- Stale claimed runs → requeued after 90s
- Multi-click / same run → session lock on `prompt_run_id`
