import { google, docs_v1 } from "googleapis";
import { COVER_LETTER_METRIC_PATTERN } from "@/lib/cover-letter/normalize";
import { findIconGlyphRanges } from "@/lib/resume/icon-glyphs";

type GoogleAuthClient = InstanceType<typeof google.auth.OAuth2>;

/**
 * An editable slot in the master doc, identified by original text.
 * Runtime replacement uses replaceAllText which preserves formatting.
 */
export interface DocSlot {
  key: string;
  /** Original text in the master doc (must be unique across editable slots) */
  original: string;
  section: "headline" | "experience" | "project" | "skill";
  /** Zero-based indices for structured slots */
  experience_index?: number;
  bullet_index?: number;
  project_index?: number;
  skill_index?: number;
  /** Word count when synced from the master Google Doc bullet line */
  word_count?: number;
}

export interface DocLayoutMap {
  master_doc_id: string;
  version: number;
  mapped_at: string;
  slots: DocSlot[];
  /** Word budget from WORK EXPERIENCE through SKILLS (synced from Google Doc). */
  word_budget?: {
    work_through_skills_total: number;
    fixed_line_words: number;
    tailorable_words: number;
  };
}

/** How one line of a rebuilt resume Doc is meant to read. */
export type DocLineKind =
  /** The candidate's name, at the top of page one. */
  | "title"
  /** The contact / links row under the name. */
  | "contact"
  /** A section title — WORK EXPERIENCE, SKILLS, EDUCATION. */
  | "heading"
  /** A role, project or degree row: bold, but not a section. */
  | "subheading"
  | "bullet"
  | "body";

export interface DocTextLink {
  /** Character offsets within the line's own text. */
  start: number;
  end: number;
  url: string;
}

export interface StructuredDocLine {
  text: string;
  kind: DocLineKind;
  /** Runs inside `text` that must be clickable in the Doc. */
  links?: DocTextLink[];
  /** Leading characters to bold — the "Category:" of a skills line. */
  bold_prefix?: number;
}

const DOC_FONT = "Arial";
/**
 * Point sizes for a resume Doc.
 *
 * Every size is written explicitly. Inserted text inherits the style of
 * whatever sits at the insertion point, and for a Doc converted from a PDF
 * that is the 25pt name at the top of the page — which is how a whole resume
 * ended up printed at heading size after a rebuild.
 */
const DOC_SIZE = { body: 10.5, contact: 9.5, heading: 11.5, title: 20 } as const;

const BLACK = { color: { rgbColor: { red: 0, green: 0, blue: 0 } } };
const LINK_BLUE = { color: { rgbColor: { red: 0.06, green: 0.33, blue: 0.8 } } };

function pt(magnitude: number): docs_v1.Schema$Dimension {
  return { magnitude, unit: "PT" };
}

type Range = { startIndex: number; endIndex: number };

/**
 * Clear every inherited attribute across the rebuilt body.
 *
 * Written as one pair of requests over the whole insert rather than per line:
 * the point is that nothing survives from the document that was there before.
 */
function bodyResetRequests(range: Range): docs_v1.Schema$Request[] {
  return [
    {
      updateParagraphStyle: {
        range,
        paragraphStyle: {
          namedStyleType: "NORMAL_TEXT",
          alignment: "START",
          lineSpacing: 100,
          spaceAbove: pt(0),
          spaceBelow: pt(2),
          indentStart: pt(0),
          indentFirstLine: pt(0),
        },
        fields:
          "namedStyleType,alignment,lineSpacing,spaceAbove,spaceBelow,indentStart,indentFirstLine",
      },
    },
    {
      updateTextStyle: {
        range,
        textStyle: {
          bold: false,
          italic: false,
          underline: false,
          fontSize: pt(DOC_SIZE.body),
          weightedFontFamily: { fontFamily: DOC_FONT },
          foregroundColor: BLACK,
        },
        // Explicit list rather than "*": link is cleared here on purpose, and
        // the remaining unnamed fields (background shading, baseline offset)
        // are left to the document default.
        fields:
          "bold,italic,underline,fontSize,weightedFontFamily,foregroundColor,link",
      },
    },
  ];
}

/** The per-kind look: what makes a heading read as a heading. */
function lineStyleRequests(
  line: StructuredDocLine,
  range: Range,
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];

  switch (line.kind) {
    case "title":
      requests.push(
        {
          updateParagraphStyle: {
            range,
            paragraphStyle: { alignment: "CENTER", spaceBelow: pt(2) },
            fields: "alignment,spaceBelow",
          },
        },
        {
          updateTextStyle: {
            range,
            textStyle: { bold: true, fontSize: pt(DOC_SIZE.title) },
            fields: "bold,fontSize",
          },
        },
      );
      break;

    case "contact":
      requests.push(
        {
          updateParagraphStyle: {
            range,
            paragraphStyle: { alignment: "CENTER", spaceBelow: pt(6) },
            fields: "alignment,spaceBelow",
          },
        },
        {
          updateTextStyle: {
            range,
            textStyle: { fontSize: pt(DOC_SIZE.contact) },
            fields: "fontSize",
          },
        },
      );
      break;

    case "heading":
      requests.push(
        {
          updateParagraphStyle: {
            range,
            paragraphStyle: {
              // A real named heading, so the Doc gets an outline and the
              // section hierarchy survives round trips through Docs.
              namedStyleType: "HEADING_2",
              spaceAbove: pt(10),
              spaceBelow: pt(3),
              // The rule under a section title, as the printed CV has it.
              borderBottom: {
                color: BLACK,
                width: pt(1),
                padding: pt(1),
                dashStyle: "SOLID",
              },
            },
            fields: "namedStyleType,spaceAbove,spaceBelow,borderBottom",
          },
        },
        {
          // Docs' stock HEADING_2 is large and blue; a resume section is
          // black, bold and only slightly larger than the body.
          updateTextStyle: {
            range,
            textStyle: {
              bold: true,
              fontSize: pt(DOC_SIZE.heading),
              foregroundColor: BLACK,
              weightedFontFamily: { fontFamily: DOC_FONT },
            },
            fields: "bold,fontSize,foregroundColor,weightedFontFamily",
          },
        },
      );
      break;

    case "subheading":
      requests.push(
        {
          updateParagraphStyle: {
            range,
            paragraphStyle: { spaceAbove: pt(4), spaceBelow: pt(1) },
            fields: "spaceAbove,spaceBelow",
          },
        },
        {
          updateTextStyle: {
            range,
            textStyle: { bold: true },
            fields: "bold",
          },
        },
      );
      break;

    default:
      break;
  }

  if (line.bold_prefix && line.bold_prefix > 0) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: range.startIndex,
          endIndex: Math.min(range.startIndex + line.bold_prefix, range.endIndex),
        },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }

  for (const link of line.links ?? []) {
    const start = range.startIndex + link.start;
    const end = range.startIndex + link.end;
    if (!link.url || end <= start || end > range.endIndex) continue;
    requests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end },
        textStyle: {
          link: { url: link.url },
          foregroundColor: LINK_BLUE,
          underline: true,
        },
        fields: "link,foregroundColor,underline",
      },
    });
  }

  return requests;
}

/**
 * URLs and email addresses a resume writes out in full.
 *
 * Deliberately narrow: a real scheme, a www host, an address, or the two
 * profile domains people habitually paste bare. Linkifying anything that
 * merely looks domain-shaped would turn "Node.js" into a link.
 */
const BARE_LINK_RE =
  /(?:https?:\/\/|www\.)[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:linkedin\.com|github\.com)\/[^\s<>"']+/gi;

function hrefForBareLink(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.includes("@") && !raw.includes("/")) return `mailto:${raw}`;
  return `https://${raw}`;
}

/** Paragraph text plus the doc index of each character, for in-place edits. */
function paragraphCharIndices(
  doc: docs_v1.Schema$Document,
): Array<{ text: string; indices: number[] }> {
  const out: Array<{ text: string; indices: number[] }> = [];
  for (const el of doc.body?.content ?? []) {
    if (!el.paragraph) continue;
    let text = "";
    const indices: number[] = [];
    for (const child of el.paragraph.elements ?? []) {
      const content = child.textRun?.content;
      const start = child.startIndex;
      if (!content || start == null) continue;
      for (let i = 0; i < content.length; i++) {
        text += content[i];
        indices.push(start + i);
      }
    }
    out.push({ text, indices });
  }
  return out;
}

export class DocsClient {
  constructor(private auth: GoogleAuthClient) {}

  private docs() {
    return google.docs({ version: "v1", auth: this.auth });
  }

  async getDocument(docId: string): Promise<docs_v1.Schema$Document> {
    const res = await this.docs().documents.get({ documentId: docId });
    return res.data;
  }

  async batchUpdate(
    docId: string,
    requests: docs_v1.Schema$Request[],
  ): Promise<void> {
    if (requests.length === 0) return;
    await this.docs().documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  /**
   * Replace a document's whole body with the given lines.
   *
   * Used for two things: rebuilding a Doc that Drive mangled while converting
   * a PDF, and writing a Doc straight from the CV builder's own data. Both
   * need the same guarantees — real list bullets, section headings that are
   * actual Docs headings, working hyperlinks, and body text at body size.
   *
   * Every attribute is written explicitly. Text inserted at index 1 inherits
   * the formatting of whatever was there before, so a rebuild of a PDF import
   * used to pick up the 25pt name from the top of the converted page and print
   * the entire resume at that size.
   */
  async writeStructuredBody(
    docId: string,
    lines: StructuredDocLine[],
    options: { tightMargins?: boolean } = {},
  ): Promise<void> {
    const doc = await this.getDocument(docId);
    const endIndex = doc.body?.content?.at(-1)?.endIndex ?? 2;

    // Docs keeps a trailing newline that cannot be deleted; clear everything
    // before it, then insert the rebuilt body in one shot.
    const clearRequests: docs_v1.Schema$Request[] =
      endIndex > 2
        ? [
            {
              deleteContentRange: {
                range: { startIndex: 1, endIndex: endIndex - 1 },
              },
            },
          ]
        : [];

    const body = lines.map((l) => l.text).join("\n") + "\n";

    // Ranges are computed against the inserted text. Style requests never move
    // text, so they all share these indices; bulleting a range does shift what
    // follows it, hence the back-to-front order at the end. Requests inside one
    // batchUpdate are applied in sequence, so the whole rewrite fits in a
    // single round trip; the previous one-call-per-bullet-run loop was the
    // bulk of the import wait.
    const styleRequests: docs_v1.Schema$Request[] = [];
    const bulletRanges: Array<{ start: number; end: number }> = [];
    let cursor = 1;
    let runStart: number | null = null;

    lines.forEach((line, i) => {
      const startIndex = cursor;
      // +1 for the newline that terminates the paragraph.
      const lineEnd = cursor + line.text.length + 1;
      cursor = lineEnd;

      styleRequests.push(
        ...lineStyleRequests(line, { startIndex, endIndex: lineEnd }),
      );

      if (line.kind === "bullet") {
        if (runStart === null) runStart = startIndex;
        if (i === lines.length - 1 || lines[i + 1].kind !== "bullet") {
          bulletRanges.push({ start: runStart, end: lineEnd });
          runStart = null;
        }
      }
    });

    const marginRequests: docs_v1.Schema$Request[] = options.tightMargins
      ? [
          {
            updateDocumentStyle: {
              // A resume runs closer to the edge of the page than a letter
              // does; Docs' default one-inch frame pushes a two-page CV
              // onto three.
              documentStyle: {
                marginTop: pt(36),
                marginBottom: pt(36),
                marginLeft: pt(40),
                marginRight: pt(40),
              },
              fields: "marginTop,marginBottom,marginLeft,marginRight",
            },
          },
        ]
      : [];

    await this.batchUpdate(docId, [
      ...clearRequests,
      { insertText: { location: { index: 1 }, text: body } },
      ...marginRequests,
      ...bodyResetRequests({ startIndex: 1, endIndex: 1 + body.length }),
      ...styleRequests,
      ...bulletRanges.reverse().map((range) => ({
        createParagraphBullets: {
          range: { startIndex: range.start, endIndex: range.end },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      })),
    ]);
  }

  /**
   * Rebuild a PDF-converted Doc from normalized lines.
   *
   * A thin adapter over writeStructuredBody, kept because the PDF normalizer
   * describes a line with independent flags rather than a single kind.
   */
  async rewriteBody(
    docId: string,
    lines: Array<{
      text: string;
      bullet: boolean;
      /** A section heading — EXPERIENCE, SKILLS, EDUCATION… */
      heading?: boolean;
      /** A role / project / degree line: bold, but not a section. */
      subheading?: boolean;
      /** The candidate's name at the top of the page. */
      title?: boolean;
      links?: DocTextLink[];
    }>,
  ): Promise<void> {
    const structured: StructuredDocLine[] = lines.map((line, i) => ({
      text: line.text,
      kind: line.title
        ? "title"
        : line.heading
          ? "heading"
          : line.subheading
            ? "subheading"
            : line.bullet
              ? "bullet"
              : // The row under the name is the contact line — centred with
                // the name rather than left ragged against the margin.
                i === 1 && lines[0]?.title
                ? "contact"
                : "body",
      links: line.links,
    }));
    await this.writeStructuredBody(docId, structured, { tightMargins: true });
  }

  /**
   * Delete icon-font debris from a converted Doc, in place.
   *
   * Runs on every PDF import, including the ones that convert cleanly enough
   * to skip the rebuild — a "Æ" in front of the phone number is wrong either
   * way, and the contact row is the first thing an ATS reads.
   *
   * Returns whether anything was removed.
   */
  async removeIconGlyphs(
    docId: string,
    doc?: docs_v1.Schema$Document,
  ): Promise<boolean> {
    const document = doc ?? (await this.getDocument(docId));
    const deletions: Range[] = [];

    for (const { text, indices } of paragraphCharIndices(document)) {
      for (const range of findIconGlyphRanges(text)) {
        const startIndex = indices[range.start];
        const lastIndex = indices[range.end - 1];
        if (startIndex == null || lastIndex == null) continue;
        deletions.push({ startIndex, endIndex: lastIndex + 1 });
      }
    }
    if (deletions.length === 0) return false;

    // Back to front: every deletion shifts the indices after it.
    deletions.sort((a, b) => b.startIndex - a.startIndex);
    await this.batchUpdate(
      docId,
      deletions.map((range) => ({ deleteContentRange: { range } })),
    );
    return true;
  }

  /**
   * Every hyperlink in a document, paired with the text that carries it.
   *
   * Harvested before a rebuild so the links can be put back afterwards: the
   * rebuild inserts plain text, which would otherwise drop a working LinkedIn
   * or portfolio link on the floor.
   */
  static harvestLinks(
    doc: docs_v1.Schema$Document,
  ): Array<{ text: string; url: string }> {
    const found = new Map<string, string>();
    for (const el of doc.body?.content ?? []) {
      for (const child of el.paragraph?.elements ?? []) {
        const url = child.textRun?.textStyle?.link?.url;
        const text = child.textRun?.content?.trim();
        if (!url || !text) continue;
        if (!found.has(text)) found.set(text, url);
      }
    }
    return [...found].map(([text, url]) => ({ text, url }));
  }

  /**
   * Make links work in a Doc that holds them only as text.
   *
   * Two sources: labels whose URL we already know (harvested before a rebuild,
   * or taken from the user's own profile), and the bare URLs and email
   * addresses the resume spells out. Drive's PDF conversion leaves neither
   * clickable, which is what "the LinkedIn link does nothing" was.
   */
  async applyKnownLinks(
    docId: string,
    known: Array<{ text: string; url: string }>,
  ): Promise<void> {
    const doc = await this.getDocument(docId);
    const requests: docs_v1.Schema$Request[] = [];
    // Longest first, so "LinkedIn Profile" wins over "LinkedIn".
    const labels = known
      .filter((k) => k.text.trim() && k.url.trim())
      .sort((a, b) => b.text.length - a.text.length);

    for (const { text, indices } of paragraphCharIndices(doc)) {
      const claimed: Array<[number, number]> = [];
      const overlaps = (start: number, end: number) =>
        claimed.some(([s, e]) => start < e && end > s);

      const addLink = (start: number, end: number, url: string) => {
        if (end <= start || overlaps(start, end)) return;
        const startIndex = indices[start];
        const lastIndex = indices[end - 1];
        if (startIndex == null || lastIndex == null) return;
        claimed.push([start, end]);
        requests.push({
          updateTextStyle: {
            range: { startIndex, endIndex: lastIndex + 1 },
            textStyle: {
              link: { url },
              foregroundColor: LINK_BLUE,
              underline: true,
            },
            fields: "link,foregroundColor,underline",
          },
        });
      };

      for (const { text: label, url } of labels) {
        let from = 0;
        for (;;) {
          const at = text.indexOf(label, from);
          if (at < 0) break;
          addLink(at, at + label.length, url);
          from = at + label.length;
        }
      }

      for (const match of text.matchAll(BARE_LINK_RE)) {
        const raw = match[0].replace(/[.,;:)\]]+$/, "");
        const start = match.index ?? 0;
        addLink(start, start + raw.length, hrefForBareLink(raw));
      }
    }

    await this.batchUpdate(docId, requests);
  }

  /**
   * How many paragraphs already carry list formatting.
   *
   * A conversion that produced real bullets kept the original structure, and
   * rebuilding it from plain text would throw that away — see
   * convertedDocNeedsRepair.
   */
  static countBulletParagraphs(doc: docs_v1.Schema$Document): number {
    let count = 0;
    for (const el of doc.body?.content ?? []) {
      if (el.paragraph?.bullet) count += 1;
    }
    return count;
  }

  /** Insert plain text at the start of a new/empty document. */
  async insertPlainText(docId: string, text: string): Promise<void> {
    const doc = await this.getDocument(docId);
    const endIndex =
      doc.body?.content?.at(-1)?.endIndex != null
        ? doc.body.content.at(-1)!.endIndex! - 1
        : 1;
    await this.batchUpdate(docId, [
      {
        insertText: {
          location: { index: Math.max(1, endIndex) },
          text,
        },
      },
    ]);
  }
}

/**
 * Extract all paragraph text from a document (used for uniqueness checks
 * and layout mapping).
 */
export function extractParagraphText(
  doc: docs_v1.Schema$Document,
): string[] {
  const paragraphs: string[] = [];
  for (const el of doc.body?.content ?? []) {
    if (!el.paragraph) continue;
    let text = "";
    for (const child of el.paragraph.elements ?? []) {
      if (child.textRun?.content) text += child.textRun.content;
    }
    paragraphs.push(text.replace(/\n$/, ""));
  }
  return paragraphs;
}

/**
 * Build batchUpdate requests to swap slot text using replaceAllText.
 * Since each slot's original text is unique in the doc, this preserves
 * all character-level formatting (bold, italic, links, bullets).
 */
export function buildReplaceRequests(
  edits: Array<{ original: string; replacement: string }>,
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  for (const { original, replacement } of edits) {
    if (!original || original === replacement) continue;
    requests.push({
      replaceAllText: {
        containsText: { text: original, matchCase: true },
        replaceText: replacement,
      },
    });
  }
  return requests;
}

/** Bold quantified metrics in body paragraphs after text replacement. */
export function buildMetricBoldRequests(
  doc: docs_v1.Schema$Document,
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];

  for (const block of doc.body?.content ?? []) {
    if (!block.paragraph) continue;
    for (const el of block.paragraph.elements ?? []) {
      const text = el.textRun?.content;
      const startIndex = el.startIndex;
      if (!text || startIndex == null) continue;

      const pattern = new RegExp(
        COVER_LETTER_METRIC_PATTERN.source,
        COVER_LETTER_METRIC_PATTERN.flags,
      );
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const matchStart = startIndex + match.index;
        const matchEnd = matchStart + match[0].length;
        requests.push({
          updateTextStyle: {
            range: { startIndex: matchStart, endIndex: matchEnd },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }
  }

  return requests;
}

/**
 * After replaceAllText, skill lines often inherit bold from the category
 * prefix onto the whole line. Re-apply: bold "Category:" only; rest plain.
 */
export function buildSkillCategoryBoldRequests(
  doc: docs_v1.Schema$Document,
  skillLines: string[],
): docs_v1.Schema$Request[] {
  const targets = new Set(
    skillLines.map((line) => line.trim()).filter(Boolean),
  );
  if (targets.size === 0) return [];

  const requests: docs_v1.Schema$Request[] = [];

  for (const block of doc.body?.content ?? []) {
    if (!block.paragraph) continue;

    let text = "";
    let startIndex: number | null = null;
    for (const el of block.paragraph.elements ?? []) {
      if (!el.textRun?.content) continue;
      if (startIndex == null && el.startIndex != null) {
        startIndex = el.startIndex;
      }
      text += el.textRun.content;
    }
    if (startIndex == null) continue;

    const line = text.replace(/\n$/, "");
    if (!targets.has(line.trim())) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const headerEnd = startIndex + colonIdx + 1;
    const lineEnd = startIndex + line.length;

    if (headerEnd > startIndex) {
      requests.push({
        updateTextStyle: {
          range: { startIndex, endIndex: headerEnd },
          textStyle: { bold: true },
          fields: "bold",
        },
      });
    }
    if (lineEnd > headerEnd) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: headerEnd, endIndex: lineEnd },
          textStyle: { bold: false },
          fields: "bold",
        },
      });
    }
  }

  return requests;
}
