/**
 * Repair a resume Doc that Drive produced by converting a PDF.
 *
 * Drive's PDF import keeps visual lines but drops paragraph boundaries: a role
 * header and every bullet under it arrive as ONE paragraph, with the bullets
 * joined by " - ", and no list formatting at all. Parsed as-is, a three-role
 * resume syncs as one role with a handful of slots.
 *
 * This module splits those merged paragraphs back into logical lines so the
 * normal master-sync heuristics see the structure they expect.
 */

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const YEAR = "(?:19|20)\\d{2}";
/**
 * "Mar 2024 - Present", "Apr 2022 – Mar 2024", "2019 - 2023".
 *
 * Years are anchored to 19xx/20xx and fenced off from neighbouring digits or
 * dashes so a phone number like +91-99109-80793 cannot look like a range.
 */
const DATE_RANGE_SOURCE = `(?<![\\d-])(?:${MONTH}\\s+)?${YEAR}\\s*[-–—]\\s*(?:Present|Current|(?:${MONTH}\\s+)?${YEAR})(?![\\d-])`;
const DATE_RANGE_RE = new RegExp(DATE_RANGE_SOURCE, "i");
const DATE_RANGE_GLOBAL_RE = new RegExp(DATE_RANGE_SOURCE, "gi");

/** Horizontal rules the PDF converter renders as long dash runs. */
const RULE_RE = /^[-_=]{10,}$/;

const SECTION_HEADING_RE =
  /^(WORK\s+EXPERIENCE|EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|EMPLOYMENT(\s+HISTORY)?|CAREER(\s+HISTORY)?|PROJECTS|KEY\s+PROJECTS|SELECTED\s+PROJECTS|CASE\s+STUDIES|SKILLS|TECHNICAL\s+SKILLS|TECH\s+STACK|TOOLS|EDUCATION|ACADEMICS?|QUALIFICATIONS|CERTIFICATIONS?|ACHIEVEMENTS?|SUMMARY|PROFILE)\s*:?\s*$/i;

export type NormalizedLineKind = "heading" | "bullet" | "plain";

export interface NormalizedLine {
  text: string;
  kind: NormalizedLineKind;
}

/** Control char — never present in Doc text, so masking cannot collide. */
const SPLIT_TOKEN = String.fromCharCode(1);

/**
 * Split a merged paragraph on " - " separators without cutting date ranges
 * ("Mar 2024 - Present") or inline ranges the converter left intact.
 */
function splitOnBulletSeparators(text: string): string[] {
  const preserved: string[] = [];
  const masked = text.replace(DATE_RANGE_GLOBAL_RE, (match) => {
    preserved.push(match);
    return `${SPLIT_TOKEN}${preserved.length - 1}${SPLIT_TOKEN}`;
  });

  return masked
    .split(/\s+[-–—•]\s+/)
    .map((part) =>
      part
        .replace(
          new RegExp(`${SPLIT_TOKEN}(\\d+)${SPLIT_TOKEN}`, "g"),
          (_, i: string) => preserved[Number(i)] ?? "",
        )
        .trim(),
    )
    .filter((part) => part.length > 0);
}

/** Strip a leading bullet glyph the converter turned into plain text. */
function stripLeadingGlyph(text: string): string {
  return text.replace(/^[-–—•*•]\s*/, "").trim();
}

/**
 * A role/education header ends at its date range — everything after it in the
 * same paragraph is bullet text the converter glued on.
 */
function splitHeaderFromBody(
  text: string,
): { header: string; body: string } | null {
  const match = DATE_RANGE_RE.exec(text);
  if (!match) return null;
  const cut = match.index + match[0].length;
  const header = text.slice(0, cut).trim();
  const body = text.slice(cut).trim();
  if (!header) return null;
  return { header, body };
}

/**
 * Education entries arrive as one run of several "institution … dates" pairs.
 * Cut after every date range instead of on " - ".
 */
function splitEducationRun(text: string): string[] {
  const entries: string[] = [];
  let rest = text;
  for (;;) {
    const match = DATE_RANGE_RE.exec(rest);
    if (!match) break;
    const cut = match.index + match[0].length;
    const entry = rest.slice(0, cut).trim();
    if (entry) entries.push(entry);
    rest = rest.slice(cut).trim();
  }
  if (rest) entries.push(rest);
  return entries.length > 0 ? entries : [text];
}

/**
 * A project title reads "Name | Link | Tech, Stack". The converter often flows
 * the previous project's last bullet and the next title into one paragraph, so
 * cut immediately before any embedded title.
 */
const EMBEDDED_PROJECT_TITLE_RE =
  /(?<=\.)\s+(?=[A-Z][A-Za-z0-9 &'’/+-]{2,60}\s*\|[^|]{0,80}\|)/g;

function splitEmbeddedProjectTitles(text: string): string[] {
  const parts = text
    .split(EMBEDDED_PROJECT_TITLE_RE)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function isSkillLine(text: string): boolean {
  // "Category: a, b, c" — the shape master-sync expects for SKILLS.
  const compact = stripLeadingGlyph(text);
  const colon = compact.indexOf(":");
  return colon > 0 && colon <= 60;
}

/**
 * Turn the raw paragraph texts of a PDF-converted Doc into logical resume
 * lines. Paragraph order is preserved; only merged runs are split apart.
 */
export function normalizeConvertedPdfParagraphs(
  rawParagraphs: string[],
): NormalizedLine[] {
  const lines: NormalizedLine[] = [];
  let section: "experience" | "projects" | "skills" | "education" | "other" =
    "other";

  for (const raw of rawParagraphs) {
    // The converter prefixes contact rows with a long rule; drop the rule but
    // keep the text that follows it on the same paragraph.
    let text = raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    text = text.replace(/[-_=]{10,}/g, " ").replace(/\s+/g, " ").trim();
    if (!text || RULE_RE.test(text)) continue;

    if (SECTION_HEADING_RE.test(text)) {
      const upper = text.toUpperCase();
      section = /PROJECT|CASE/.test(upper)
        ? "projects"
        : /SKILL|TECH|TOOLS/.test(upper)
          ? "skills"
          : /EDUCATION|ACADEMIC|QUALIFICATION/.test(upper)
            ? "education"
            : /EXPERIENCE|EMPLOYMENT|CAREER/.test(upper)
              ? "experience"
              : "other";
      lines.push({ text, kind: "heading" });
      continue;
    }

    if (section === "education") {
      for (const entry of splitEducationRun(text)) {
        lines.push({ text: entry, kind: "plain" });
      }
      continue;
    }

    if (section === "skills") {
      for (const part of splitOnBulletSeparators(text)) {
        const clean = stripLeadingGlyph(part);
        if (clean) lines.push({ text: clean, kind: "bullet" });
      }
      continue;
    }

    // A projects paragraph can carry the previous bullet's tail plus the next
    // title — handle each embedded title as its own chunk.
    const chunks =
      section === "projects" ? splitEmbeddedProjectTitles(text) : [text];
    for (const chunk of chunks) {
      emitContentChunk(chunk, lines);
    }
  }

  return dedupeAdjacent(lines);
}

/** Split one content paragraph into a header line plus its bullets. */
function emitContentChunk(text: string, lines: NormalizedLine[]): void {
    // Experience / projects: peel the header off, then split the glued bullets.
    const startsAsBullet = /^[-–—•*•]\s+/.test(text);
    if (!startsAsBullet) {
      const split = splitHeaderFromBody(text);
      if (split) {
        lines.push({ text: split.header, kind: "plain" });
        for (const part of splitOnBulletSeparators(split.body)) {
          const clean = stripLeadingGlyph(part);
          if (clean) lines.push({ text: clean, kind: "bullet" });
        }
        return;
      }
    }

    const parts = splitOnBulletSeparators(text);
    if (parts.length === 0) return;

    if (startsAsBullet) {
      for (const part of parts) {
        const clean = stripLeadingGlyph(part);
        if (clean) lines.push({ text: clean, kind: "bullet" });
      }
      return;
    }

    // No date range: first segment reads as a title line (project titles carry
    // "Name | stack"), the remainder are its bullets.
    const [first, ...rest] = parts;
    const firstClean = stripLeadingGlyph(first);
    if (firstClean) {
      lines.push({
        text: firstClean,
        kind: rest.length === 0 && isSkillLine(firstClean) ? "bullet" : "plain",
      });
    }
    for (const part of rest) {
      const clean = stripLeadingGlyph(part);
      if (clean) lines.push({ text: clean, kind: "bullet" });
    }
}

/** Slot text must be unique in the Doc — drop exact repeats. */
function dedupeAdjacent(lines: NormalizedLine[]): NormalizedLine[] {
  const seen = new Set<string>();
  const out: NormalizedLine[] = [];
  for (const line of lines) {
    const key = `${line.kind}:${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
