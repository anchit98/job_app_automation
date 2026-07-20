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
