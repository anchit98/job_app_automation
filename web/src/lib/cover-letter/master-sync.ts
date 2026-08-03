import { DocsClient, extractParagraphText } from "@/lib/google/docs";
import type { CoverLetterContent } from "@/lib/cover-letter/validate";

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

const EXPECTED_BODY_PARAGRAPHS = 5;

const CLOSING_PHRASE_ONLY =
  /^(?:Sincerely|Warm\s+regards|Best\s+regards|Kind\s+regards|With\s+regards|Yours\s+truly|Yours\s+sincerely|Regards|Thank\s+you|Thanks),?\s*$/i;

const CLOSING_PHRASE_START =
  /^(?:Sincerely|Warm\s+regards|Best\s+regards|Kind\s+regards|With\s+regards|Yours\s+truly|Yours\s+sincerely|Regards|Thank\s+you|Thanks)\b/i;

function isLikelyNameLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 60 || /[.!?]/.test(t)) return false;
  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4}$/.test(t);
}

function isSignoffParagraph(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CLOSING_PHRASE_ONLY.test(t)) return true;
  if (CLOSING_PHRASE_START.test(t) && t.length <= 80) return true;
  // Soft line-break: "Warm regards," + name in one Docs paragraph
  if (t.includes("\u000b") && CLOSING_PHRASE_START.test(t.split("\u000b")[0] ?? "")) {
    return true;
  }
  if (t.includes("\n") && CLOSING_PHRASE_START.test(t.split("\n")[0] ?? "")) {
    return true;
  }
  return false;
}

/**
 * Locate the real template sign-off near the end (Warm regards / Sincerely…),
 * not the last body/CTA sample paragraph.
 */
export function splitCoverLetterTemplateParagraphs(paragraphs: string[]): {
  greeting: string;
  bodyParagraphs: string[];
  signoff: string;
  nameParagraph: string | null;
} {
  if (paragraphs.length < EXPECTED_BODY_PARAGRAPHS + 2) {
    throw new Error(
      `Cover letter template must have a greeting, ${EXPECTED_BODY_PARAGRAPHS} body paragraphs, and a sign-off. Found ${paragraphs.length} non-empty paragraphs.`,
    );
  }

  let signoffIndex = -1;
  for (let i = paragraphs.length - 1; i >= 1; i--) {
    if (isSignoffParagraph(paragraphs[i])) {
      signoffIndex = i;
      break;
    }
    // Name line immediately after a closing phrase
    if (
      isLikelyNameLine(paragraphs[i]) &&
      i - 1 >= 1 &&
      isSignoffParagraph(paragraphs[i - 1])
    ) {
      signoffIndex = i - 1;
      break;
    }
  }

  if (signoffIndex < 0) {
    throw new Error(
      'Cover letter template must end with a sign-off such as "Warm regards," (optionally followed by your name). Re-sync after fixing the Doc.',
    );
  }

  const greeting = paragraphs[0];
  const between = paragraphs.slice(1, signoffIndex);
  if (between.length !== EXPECTED_BODY_PARAGRAPHS) {
    throw new Error(
      `Cover letter template needs exactly ${EXPECTED_BODY_PARAGRAPHS} body paragraphs between the greeting and sign-off. Found ${between.length}.`,
    );
  }
  const bodyParagraphs = between;

  const signoff = paragraphs[signoffIndex];
  const after = paragraphs.slice(signoffIndex + 1);
  const nameParagraph =
    after.length === 1 && isLikelyNameLine(after[0]) ? after[0] : null;

  if (after.length > 1 || (after.length === 1 && !nameParagraph)) {
    throw new Error(
      "Unexpected paragraphs after the cover letter sign-off. Keep only Warm regards (and optional name) at the end.",
    );
  }

  return { greeting, bodyParagraphs, signoff, nameParagraph };
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

  const originals = new Set<string>();
  for (const text of [
    greeting,
    ...bodyParagraphs,
    signoff,
    ...(nameParagraph ? [nameParagraph] : []),
  ]) {
    if (originals.has(text)) {
      throw new Error(
        "Duplicate paragraph text in cover letter template - each slot must be unique for replaceAllText.",
      );
    }
    originals.add(text);
  }

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
