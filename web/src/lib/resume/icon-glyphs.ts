/**
 * Icon-font debris left behind when a PDF's text is extracted.
 *
 * The most popular LaTeX resume templates (ours included, until now) print the
 * contact row with FontAwesome glyphs. Those glyphs live in a Type1 font with a
 * private encoding and no usable ToUnicode map, so every text extractor —
 * Drive's PDF import, `pdftotext`, and every ATS parser — reads them as
 * whatever byte the encoding happened to use:
 *
 *   "Æ 9910980793 | [ jobs@example.com | ° LinkedIn |  GitHub | ½ Bengaluru"
 *
 * The phone icon becomes Æ, the envelope a "[", the map pin a "½", and the
 * brand marks land in the private use area where they render as tofu boxes.
 *
 * Nothing downstream can use those characters, so they are stripped on import.
 * A glyph is only removed when it stands alone as its own token: that is how an
 * icon always appears (icon, space, value), and it keeps a real accented word
 * or a "25 °C" measurement intact.
 */

/** Separators a resume genuinely uses between contact items. */
const KEPT_SYMBOLS = new Set(["·", "‧", "–", "—", "•", "|", "/", "\\", "-"]);

/**
 * ASCII characters that are never a word on their own in a resume, and that
 * icon encodings do emit. Brackets and braces are the common ones — the
 * FontAwesome envelope extracts as "[".
 */
const ASCII_ARTIFACTS = new Set([
  "[", "]", "{", "}", "<", ">", "^", "~", "_", "=", "`", "\"", "'", "“", "”",
]);

/** Characters that are debris wherever they appear, not only standalone. */
const ALWAYS_DEBRIS_RE = /[\uE000-\uF8FF\uFFFD]/;

/** Is this single character an icon glyph rather than content? */
function isArtifactChar(ch: string): boolean {
  if (KEPT_SYMBOLS.has(ch)) return false;
  if (ALWAYS_DEBRIS_RE.test(ch)) return true;
  if (ASCII_ARTIFACTS.has(ch)) return true;
  const code = ch.codePointAt(0) ?? 0;
  // Geometric shapes and dingbats: what a viewer shows for a missing glyph.
  if (code >= 0x25a0 && code <= 0x25ff) return true;
  if (code >= 0x2700 && code <= 0x27bf) return true;
  // Latin-1 supplement. A single character from this block is never a word:
  // "Æ", "°", "½", "§" are all icon slots, while "é" only ever appears inside
  // one, which the standalone-token rule below protects.
  if (code >= 0x00a1 && code <= 0x00ff) return true;
  return false;
}

/** A one-character token that carries no meaning — the shape an icon takes. */
export function isIconArtifactToken(token: string): boolean {
  return token.length === 1 && isArtifactChar(token);
}

/**
 * Remove icon debris from one line of extracted text.
 *
 * Private-use characters go wherever they sit; everything else must be its own
 * whitespace-delimited token. Separator runs left dangling by a removal
 * ("| | LinkedIn") are collapsed so the line reads as it was designed to.
 */
export function stripIconGlyphs(text: string): string {
  if (!text) return text;

  const withoutPua = text.replace(new RegExp(ALWAYS_DEBRIS_RE.source, "g"), " ");
  const kept = withoutPua
    .split(/(\s+)/)
    .filter((part) => !isIconArtifactToken(part))
    .join("");

  return kept
    .replace(/\s{2,}/g, " ")
    .replace(/(?:^|\s)\|(?=\s*\||\s*$)/g, "")
    .replace(/^\s*\|\s*/, "")
    .trim();
}

/**
 * Character offsets of the icon debris in a line, for callers that must edit a
 * live document in place rather than rewrite it.
 *
 * Each range covers the glyph plus the single space padding it, so removing it
 * does not leave a double space behind.
 */
export function findIconGlyphRanges(
  text: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const isBoundary = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!isArtifactChar(ch)) continue;
    const alwaysDebris = ALWAYS_DEBRIS_RE.test(ch);
    if (!alwaysDebris && !(isBoundary(text[i - 1]) && isBoundary(text[i + 1]))) {
      continue;
    }
    const end = text[i + 1] === " " ? i + 2 : i + 1;
    ranges.push({ start: i, end });
  }
  return ranges;
}
