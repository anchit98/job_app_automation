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
  signoff: { original: string };
}

const EXPECTED_BODY_PARAGRAPHS = 5;

export async function syncMasterCoverLetterFromDoc(
  client: DocsClient,
  docId: string,
): Promise<CoverLetterLayoutMap> {
  const doc = await client.getDocument(docId);
  const allParagraphs = extractParagraphText(doc);
  const paragraphs = allParagraphs.filter((p) => p.trim().length > 0);

  if (paragraphs.length < EXPECTED_BODY_PARAGRAPHS + 2) {
    throw new Error(
      `Cover letter template must have a greeting, ${EXPECTED_BODY_PARAGRAPHS} body paragraphs, and a sign-off. Found ${paragraphs.length} non-empty paragraphs.`,
    );
  }

  const greeting = paragraphs[0];
  const bodyParagraphs = paragraphs.slice(1, 1 + EXPECTED_BODY_PARAGRAPHS);
  const signoff = paragraphs[1 + EXPECTED_BODY_PARAGRAPHS];

  const originals = new Set<string>();
  for (const text of [greeting, ...bodyParagraphs, signoff]) {
    if (originals.has(text)) {
      throw new Error(
        "Duplicate paragraph text in cover letter template - each slot must be unique for replaceAllText.",
      );
    }
    originals.add(text);
  }

  const body_slots: CoverLetterBodySlot[] = bodyParagraphs.map((original, index) => ({
    key: `body_${index}`,
    original,
    index,
  }));

  return {
    master_doc_id: docId,
    version: 1,
    mapped_at: new Date().toISOString(),
    greeting: { original: greeting },
    body_slots,
    signoff: { original: signoff },
  };
}

/** Map structured cover letter JSON to the five template body paragraphs. */
export function mapContentToBodyParagraphs(
  content: CoverLetterContent,
): string[] {
  const ev = content.evidence_points;
  const closing = `${content.why_this_company} ${content.cta}`.trim();

  const hook = content.opening_hook.replace(
    /^Dear\s+[^,\n]+(?:\s+Hiring\s+(?:Team|Manager))?,?\s*/i,
    "",
  ).trim();

  if (ev.length >= 3) {
    return [
      hook,
      content.why_this_role,
      ev[0],
      ev[1],
      `${ev[2]} ${closing}`.trim(),
    ];
  }

  return [
    hook,
    content.why_this_role,
    ev[0],
    ev[1],
    closing,
  ];
}

export function buildCoverLetterGreeting(
  company: string | null,
  fallback = "Dear Hiring Manager,",
): string {
  const c = company?.trim();
  return c ? `Dear ${c} Hiring Team,` : fallback;
}

export function buildCoverLetterSignoff(
  fullName: string,
  originalSignoff: string,
): string {
  if (originalSignoff.includes("\u000b")) {
    const [prefix] = originalSignoff.split("\u000b");
    return `${prefix}\u000b${fullName}`;
  }
  const lines = originalSignoff.split("\n");
  if (lines.length >= 2) {
    return `${lines[0]}\n${fullName}`;
  }
  return `Warm regards,\n${fullName}`;
}
