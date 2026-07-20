# JobApp Bridge (Chrome MV3) — Phase 8

Closes the ChatGPT loop for Quick Apply: paste prompt → wait for reply → POST back to the app. No manual copy/paste.

## Install (required once)

1. Start the app: `npm run dev` in `web/` → http://localhost:3000
2. Open **Settings** (or start a Quick Apply — a token is auto-created).
3. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select this `extension/` folder.
4. Extension **Options**:
   - App URL: `http://localhost:3000`
   - Paste the token from Settings
   - Enabled: on → **Save**
5. Reload the JobApp tab. Status should show **extension detected**.

After code updates to this folder, click **Reload** on the extension card in `chrome://extensions`.

## How it works

1. **Quick Apply** arms a short-lived server wake, then dispatches `jobapp-pending`.
2. Extension must `consume_wake` successfully before opening ChatGPT — refreshes and background polls cannot open a tab.
3. Legacy `GET /api/extension/pending` always returns `null` (stops older builds that polled on focus/refresh).
4. After the reply: paste-back → delete chat → close tab. The next pipeline stage arms + signals again.

**Required:** after updating this folder, click **Reload** on JobApp Bridge in `chrome://extensions`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Stuck on “Tailor resume” | No token / extension not loaded — complete Settings setup, reload extension |
| “Could not find ChatGPT input” | Stay logged into chatgpt.com; reload extension; try a fresh ChatGPT tab |
| 401 on paste-back | Token mismatch — Rotate token in Settings and paste into Options again |
| Claimed but never finishes | Wait 90s for auto-requeue, or Reload extension and refresh the pipeline page |

## Edge cases covered

- Missing extension → setup banner on pipeline page
- DOM selector drift → multiple strategies + inject retry
- 5-minute response timeout → posts `partial: true`
- Stale claimed runs → requeued after 90s
- Multi-click / same run → session lock on `prompt_run_id`
