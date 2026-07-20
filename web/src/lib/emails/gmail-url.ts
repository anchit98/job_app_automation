/** Browser-safe Gmail draft deep link (no googleapis dependency). */
export function gmailDraftWebUrl(draftId: string): string {
  return `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(draftId)}`;
}
