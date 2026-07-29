-- Store Gmail thread + RFC Message-ID when drafts are created (for follow-up replies).
ALTER TABLE emails ADD COLUMN gmail_thread_id TEXT;
ALTER TABLE emails ADD COLUMN gmail_rfc_message_id TEXT;
