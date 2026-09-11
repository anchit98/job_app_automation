/**
 * Clean up a cover letter Doc that Drive produced by converting a PDF or Word file.
 *
 * The sync expects exactly: greeting, N body paragraphs, sign-off, optional
 * name line. A converted letter usually carries a header block first (name,
 * contact row, date, recipient address) and sometimes a footer after the
 * sign-off, which would make the greeting resolve to the wrong paragraph.
 *
 * This only trims and cleans — it never merges or splits body paragraphs,
 * because paragraph count is the user's own editorial choice.
 */

const GREETING_RE =
  /^(dear\b|hello\b|hi\b|greetings\b|to\s+whom\s+it\s+may\s+concern\b|respected\b)/i;

const SIGNOFF_RE =
  /^(?:sincerely|warm\s+regards|best\s+regards|kind\s+regards|with\s+regards|yours\s+truly|yours\s+sincerely|regards|thank\s+you|thanks)\b/i;

/** Horizontal rules the PDF converter renders as long dash/underscore runs. */
const RULE_RE = /^[-_=*·•\s]{6,}$/;

/**
 * Icon fonts in a PDF header convert to stray symbols ("Æ", "°", "½", "").
 * Strip them when they sit alone or lead a line, but never touch letters.
 */
function stripGlyphNoise(text: string): string {
  return text
    .replace(/[-￼�]/g, " ")
    .replace(/(^|\s)[^\w\s,.;:'"()\-/&@+#%]{1,2}(?=\s)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNameLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 60 || /[.!?]/.test(t)) return false;
  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4}$/.test(t);
}

/**
 * Turn raw converted paragraphs into the greeting → body → sign-off shape the
 * cover letter sync expects. Returns the paragraphs unchanged when no greeting
 * or sign-off can be located, so the sync's own error message still applies.
 */
export function normalizeConvertedCoverLetterParagraphs(
  rawParagraphs: string[],
): string[] {
  const cleaned = rawParagraphs
    .map((p) => stripGlyphNoise(p.replace(/\n/g, " ")))
    .filter((p) => p.length > 0 && !RULE_RE.test(p));

  const greetingIndex = cleaned.findIndex((p) => GREETING_RE.test(p));
  if (greetingIndex < 0) return cleaned;

  // Everything above the greeting is letterhead: name, contact row, date,
  // recipient address. The sync treats paragraph 0 as the greeting.
  const fromGreeting = cleaned.slice(greetingIndex);

  let signoffIndex = -1;
  for (let i = fromGreeting.length - 1; i >= 1; i--) {
    if (SIGNOFF_RE.test(fromGreeting[i])) {
      signoffIndex = i;
      break;
    }
  }
  if (signoffIndex < 0) return fromGreeting;

  // Keep at most one name line after the sign-off; drop page numbers, repeated
  // contact details and other footer noise.
  const after = fromGreeting.slice(signoffIndex + 1);
  const nameLine = after.find((p) => isLikelyNameLine(p));

  return [
    ...fromGreeting.slice(0, signoffIndex + 1),
    ...(nameLine ? [nameLine] : []),
  ];
}
