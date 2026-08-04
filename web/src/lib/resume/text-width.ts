/**
 * Proportional-font width estimator.
 *
 * Line wrapping in the Google Doc depends on RENDERED WIDTH, not character count.
 * A "W" is ~4x wider than an "i", so two bullets with equal character counts can
 * wrap differently. We approximate the rendered width in "em units" (1 unit ≈ the
 * width of an average character) using per-glyph relative widths tuned for the
 * Calibri/Arial-class font used in the master resume.
 *
 * The absolute scale is arbitrary — we calibrate the 2-line ceiling against the
 * master resume's known-good bullets in bullet-layout.ts, so only relative widths
 * matter here.
 */

const NARROW = 0.42; // i l I j t f r . , : ; | ' ! and space
const WIDE = 1.62; // m w M W @ %
const EXTRA_WIDE = 1.85; // — em dash, and other very wide glyphs
const UPPER = 1.18; // capital letters
const DIGIT = 1.05; // 0-9
const DEFAULT = 1.0; // ordinary lowercase

const NARROW_CHARS = new Set([
  "i",
  "l",
  "I",
  "j",
  "t",
  "f",
  "r",
  ".",
  ",",
  ":",
  ";",
  "|",
  "'",
  "!",
  " ",
  "(",
  ")",
  "[",
  "]",
  "/",
  "\\",
]);
const WIDE_CHARS = new Set(["m", "w", "M", "W", "@", "%"]);
const EXTRA_WIDE_CHARS = new Set(["—", "…"]);

function glyphWidth(ch: string): number {
  if (NARROW_CHARS.has(ch)) return NARROW;
  if (WIDE_CHARS.has(ch)) return WIDE;
  if (EXTRA_WIDE_CHARS.has(ch)) return EXTRA_WIDE;
  if (ch >= "A" && ch <= "Z") return UPPER;
  if (ch >= "0" && ch <= "9") return DIGIT;
  return DEFAULT;
}

/** Estimated rendered width of a string in em-like units. */
export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text.trim()) {
    width += glyphWidth(ch);
  }
  return Math.round(width * 100) / 100;
}

/**
 * Approx Doc wrap capacity per visual line (em units).
 * Calibrated so 2-line ceiling ≈ 196 (BULLET_MAX_WIDTH) → ~98/line.
 */
export const DOC_WRAP_LINE_WIDTH = 98;

/**
 * Estimated Google Doc wrap line count for a bullet (1, 2, 3…).
 * Used to keep tailored bullets on the same visual line count as MASTER.
 */
export function estimateWrapLineCount(text: string): number {
  const width = estimateTextWidth(text);
  if (width <= 0) return 1;
  return Math.max(1, Math.ceil(width / DOC_WRAP_LINE_WIDTH));
}
