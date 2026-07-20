/**
 * Remove trailing sign-off blocks from ChatGPT output — app appends the profile signature in Gmail drafts.
 */
export function stripEmailSignature(
  bodyMd: string,
  fullName?: string | null,
): string {
  let text = bodyMd.trim();

  const closingPatterns = [
    /\n\n--\s*\n[\s\S]*$/i,
    /\n\nThanks\s*&\s*Regards,?\s*\n[\s\S]*$/i,
    /\n\n(?:Best\s+regards|Kind\s+regards|Warm\s+regards|Yours\s+sincerely|Sincerely|Regards|Cheers|Thanks|Thank\s+you),?\s*\n[\s\S]*$/i,
    /\n\n(?:Best|Kind|Warm),?\s*\n[\s\S]*$/i,
  ];

  for (const pattern of closingPatterns) {
    text = text.replace(pattern, "").trim();
  }

  if (fullName?.trim()) {
    const escaped = fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text
      .replace(new RegExp(`\\n\\n${escaped}\\s*\\n[\\s\\S]*$`, "i"), "")
      .trim();
  }

  // Trailing contact lines (phone, email) after a short closing sentence
  text = text
    .replace(
      /\n\nThank you for your time\.?\s*\n(?:.*\n)*(?:\+?\d[\d\s\-().]{7,}|[^\s@]+@[^\s@]+)[\s\S]*$/i,
      "\n\nThank you for your time.",
    )
    .trim();

  return text;
}
