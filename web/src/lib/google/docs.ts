import { google, docs_v1 } from "googleapis";
import { COVER_LETTER_METRIC_PATTERN } from "@/lib/cover-letter/normalize";

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
   * Replace a document's whole body with the given lines, restoring the
   * structure the conversion lost: real list bullets, section headings as
   * actual Docs headings, and bold sub-headers for role / project lines.
   *
   * Used for PDF imports: Drive's conversion produces one giant paragraph per
   * role with no list formatting, so the Doc is rebuilt from normalized lines
   * before master-sync reads it. The rebuild used to emit flat body text, which
   * left the reader with no section hierarchy at all — the headings looked
   * exactly like the bullets under them. Style is re-applied per line kind so
   * the rebuilt Doc reads like the resume it came from.
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
    }>,
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

    // Ranges are computed against the inserted text, and bulleting a range
    // shifts every index after it — hence the back-to-front order. Requests
    // inside one batchUpdate are applied in sequence, so the whole rewrite
    // fits in a single round trip; the previous one-call-per-bullet-run loop
    // was the bulk of the import wait.
    const bulletRanges: Array<{ start: number; end: number }> = [];
    let cursor = 1;
    let runStart: number | null = null;
    lines.forEach((line, i) => {
      const start = cursor;
      const end = cursor + line.text.length + 1;
      cursor = end;
      if (line.bullet) {
        if (runStart === null) runStart = start;
        if (i === lines.length - 1 || !lines[i + 1].bullet) {
          bulletRanges.push({ start: runStart, end });
          runStart = null;
        }
      }
    });

    // Style requests run before the bullet requests and therefore against the
    // same plain-text indices used above — no offset bookkeeping needed.
    const styleRequests: docs_v1.Schema$Request[] = [];
    let styleCursor = 1;
    for (const line of lines) {
      const startIndex = styleCursor;
      const endIndex = styleCursor + line.text.length + 1;
      styleCursor = endIndex;
      const range = { startIndex, endIndex };

      if (line.title) {
        styleRequests.push(
          {
            updateParagraphStyle: {
              range,
              paragraphStyle: { namedStyleType: "TITLE", alignment: "CENTER" },
              fields: "namedStyleType,alignment",
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
        continue;
      }

      if (line.heading) {
        styleRequests.push(
          {
            updateParagraphStyle: {
              range,
              paragraphStyle: {
                // A real named heading, so the Doc gets an outline and the
                // section hierarchy survives round trips through Docs.
                namedStyleType: "HEADING_2",
                spaceAbove: { magnitude: 10, unit: "PT" },
                spaceBelow: { magnitude: 2, unit: "PT" },
              },
              fields: "namedStyleType,spaceAbove,spaceBelow",
            },
          },
          {
            // Docs' stock HEADING_2 is large and blue; a resume section is
            // black, bold and only slightly larger than the body.
            updateTextStyle: {
              range,
              textStyle: {
                bold: true,
                fontSize: { magnitude: 12, unit: "PT" },
                foregroundColor: {
                  color: { rgbColor: { red: 0, green: 0, blue: 0 } },
                },
              },
              fields: "bold,fontSize,foregroundColor",
            },
          },
        );
        continue;
      }

      if (line.subheading) {
        styleRequests.push({
          updateTextStyle: {
            range,
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }

    await this.batchUpdate(docId, [
      ...clearRequests,
      { insertText: { location: { index: 1 }, text: body } },
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
