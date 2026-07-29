/** Normalize a Message-ID header value to include angle brackets. */
export function normalizeRfcMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

/** Subject line for a reply in an existing Gmail thread. */
export function replySubject(originalSubject: string, proposedSubject?: string): string {
  const stripped = originalSubject.replace(/^(Re:\s*)+/i, "").trim();
  if (proposedSubject?.trim()) {
    const proposed = proposedSubject.trim();
    if (/^Re:\s/i.test(proposed)) return proposed;
  }
  return stripped ? `Re: ${stripped}` : "Re:";
}
