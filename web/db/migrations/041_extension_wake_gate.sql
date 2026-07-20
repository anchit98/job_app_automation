-- Gate ChatGPT opens behind an explicit short-lived wake; kill zombie polls.

ALTER TABLE pending_extension_runs ADD COLUMN wake_until TEXT;

-- Cancel anything already queued so refresh/polling cannot reopen ChatGPT.
UPDATE pending_extension_runs
SET status = 'completed',
    error = 'cancelled_stale_on_wake_gate',
    wake_until = NULL,
    updated_at = datetime('now')
WHERE status IN ('pending', 'claimed');
