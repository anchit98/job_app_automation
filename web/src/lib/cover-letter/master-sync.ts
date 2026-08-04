import { DocsClient, extractParagraphText } from "@/lib/google/docs";
import type { CoverLetterContent } from "@/lib/cover-letter/validate";
import { assertCoverLetterAtsReady } from "@/lib/cover-letter/ats-sync";

export interface CoverLetterBodySlot {
  key: string;
  original: string;
  index: number;
}

export interface CoverLetterLayoutMap {
  master_doc_id: string;
  version: number;
  mapped_at: string;
  greeting: { original: string };
  body_slots: CoverLetterBodySlot[];
  /**
   * Closing phrase paragraph (e.g. "Warm regards,").
   * Optional `name_original` is a following name-only paragraph in the template.
   */
  signoff: { original: string; name_original?: string };
}

const CLOSING_PHRASE_ONLY =
  /^(?:Sincerely|Warm\s+regards|Best\s+regards|Kind\s+regards|With\s+regards|Yours\s+truly|Yours\s+sincerely|Regards|Thank\s+you|Thanks),?\s*$/i;

const CLOSING_PHRASE_START =
  /^(?:Sincerely|Warm\s+regards|Best\s+regards|Kind\s+regards|With\s+regards|Yours\s+truly|Yours\s+sincerely|Regards|Thank\s+you|Thanks)\b/i;

function isSignoffParagraph(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CLOSING_PHRASE_ONLY.test(t)) return true;
  if (CLOSING_PHRASE_START.test(t) && t.length <= 80) return true;
  if (t.includes("\u000b") && CLOSING_PHRASE_START.test(t.split("\u000b")[0] ?? "")) {
    return true;
  }
  if (t.includes("\n") && CLOSING_PHRASE_START.test(t.split("\n")[0] ?? "")) {
    return true;
  }
  return false;
}

/**
 * Locate greeting / body / sign-off with ATS readiness checks (1-line reasons).
 */
export function splitCoverLetterTemplateParagraphs(paragraphs: string[]): {
  greeting: string;
  bodyParagraphs: string[];
  signoff: string;
  nameParagraph: string | null;
} {
  return assertCoverLetterAtsReady(paragraphs);
}

export async function syncMasterCoverLetterFromDoc(
  client: DocsClient,
  docId: string,
): Promise<CoverLetterLayoutMap> {
  const doc = await client.getDocument(docId);
  const allParagraphs = extractParagraphText(doc);
  const paragraphs = allParagraphs.filter((p) => p.trim().length > 0);

  const { greeting, bodyParagraphs, signoff, nameParagraph } =
    splitCoverLetterTemplateParagraphs(paragraphs);

  const body_slots: CoverLetterBodySlot[] = bodyParagraphs.map(
    (original, index) => ({
      key: `body_${index}`,
      original,
      index,
    }),
  );

  return {
    master_doc_id: docId,
    version: 1,
    mapped_at: new Date().toISOString(),
    greeting: { original: greeting },
    body_slots,
    signoff: {
      original: signoff,
      ...(nameParagraph ? { name_original: nameParagraph } : {}),
    },
  };
}

/** Map structured cover letter JSON to the five template body paragraphs. */
export function mapContentToBodyParagraphs(
  content: CoverLetterContent,
): string[] {
  const ev = content.evidence_points;
  const closing = `${content.why_this_company} ${content.cta}`.trim();

  const hook = content.opening_hook
    .replace(/^Dear\s+[^,\n]+(?:\s+Hiring\s+(?:Team|Manager))?,?\s*/i, "")
    .trim();

  if (ev.length >= 3) {
    return [
      hook,
      content.why_this_role,
      ev[0],
      ev[1],
      `${ev[2]} ${closing}`.trim(),
    ];
  }

  return [hook, content.why_this_role, ev[0], ev[1], closing];
}

export function buildCoverLetterGreeting(
  company: string | null,
  fallback = "Dear Hiring Manager,",
): string {
  const c = company?.trim();
  return c ? `Dear ${c} Hiring Team,` : fallback;
}

/**
 * Preserve the template's closing phrase. Only refresh an embedded name line.
 * Never invent "Warm regards,\\nName" — that duplicates a template that already
 * has Warm regards + name as following paragraphs.
 */
export function buildCoverLetterSignoff(
  fullName: string,
  originalSignoff: string,
): string {
  const trimmed = originalSignoff.trim();
  if (!trimmed) return trimmed;

  // Soft break inside one Docs paragraph: keep phrase, swap name.
  if (originalSignoff.includes("\u000b")) {
    const [prefix] = originalSignoff.split("\u000b");
    if (CLOSING_PHRASE_START.test(prefix.trim())) {
      return `${prefix}\u000b${fullName}`;
    }
    // Not a real sign-off slot (legacy mis-map) — clear so template sign-off below remains once.
    return "";
  }

  const lines = originalSignoff.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && CLOSING_PHRASE_START.test(lines[0])) {
    return `${lines[0]}\n${fullName}`;
  }

  // Template sign-off is only the closing phrase; name is a separate paragraph.
  if (CLOSING_PHRASE_ONLY.test(trimmed) || CLOSING_PHRASE_START.test(trimmed)) {
    return trimmed;
  }

  // Legacy layouts mistakenly stored a body/CTA paragraph as "signoff".
  // Clearing avoids injecting a second Warm regards on top of the real template one.
  return "";
}

export function isCoverLetterClosingPhrase(text: string): boolean {
  return CLOSING_PHRASE_ONLY.test(text.trim()) || isSignoffParagraph(text);
}
