/** Build a short personal greeting from a contact's display name. */
export function buildFollowUpGreeting(
  contactName: string | null | undefined,
): string {
  const first = contactName?.trim().split(/\s+/).filter(Boolean)[0];
  return first ? `Hi ${first},` : "Hi,";
}

/**
 * Keep the follow-up body identical across contacts; only swap (or insert)
 * the leading Hi/Hello/Dear line.
 */
export function applyFollowUpGreeting(
  bodyMd: string,
  contactName: string | null | undefined,
): string {
  const greeting = buildFollowUpGreeting(contactName);
  const trimmed = bodyMd.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed) return `${greeting}\n`;

  const lines = trimmed.split(/\r?\n/);
  if (lines.length > 0 && /^(hi|hello|dear)\b/i.test(lines[0].trim())) {
    lines[0] = greeting;
    return lines.join("\n");
  }
  return `${greeting}\n\n${trimmed}`;
}
