import { throwAts } from "@/lib/ats/readiness-error";
export { AtsReadinessError } from "@/lib/ats/readiness-error";

const EXPECTED_BODY = 5;

/**
 * Validate cover-letter paragraph shape for ATS/template sync.
 * Throws AtsReadinessError with one-line reasons.
 */
export function assertCoverLetterAtsReady(paragraphs: string[]): {
  greeting: string;
  bodyParagraphs: string[];
  signoff: string;
  nameParagraph: string | null;
} {
  const nonEmpty = paragraphs.map((p) => p.trim()).filter(Boolean);

  if (nonEmpty.length < EXPECTED_BODY + 2) {
    throwAts(
      `Use greeting + exactly ${EXPECTED_BODY} body paragraphs + sign-off (Warm regards).`,
    );
  }

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
    if (t.includes("\u000b") && CLOSING_PHRASE_START.test(t.split("\u000b")[0] ?? "")) {
      return true;
    }
    if (t.includes("\n") && CLOSING_PHRASE_START.test(t.split("\n")[0] ?? "")) {
      return true;
    }
    return false;
  }

  let signoffIndex = -1;
  for (let i = nonEmpty.length - 1; i >= 1; i--) {
    if (isSignoffParagraph(nonEmpty[i])) {
      signoffIndex = i;
      break;
    }
    if (
      isLikelyNameLine(nonEmpty[i]) &&
      i - 1 >= 1 &&
      isSignoffParagraph(nonEmpty[i - 1])
    ) {
      signoffIndex = i - 1;
      break;
    }
  }

  if (signoffIndex < 0) {
    throwAts('End with a sign-off like "Warm regards," (optional name line after).');
  }

  const greeting = nonEmpty[0];
  const between = nonEmpty.slice(1, signoffIndex);
  if (between.length !== EXPECTED_BODY) {
    throwAts(
      `Keep exactly ${EXPECTED_BODY} body paragraphs between greeting and sign-off (found ${between.length}).`,
    );
  }

  const signoff = nonEmpty[signoffIndex];
  const after = nonEmpty.slice(signoffIndex + 1);
  const nameParagraph =
    after.length === 1 && isLikelyNameLine(after[0]) ? after[0] : null;

  if (after.length > 1 || (after.length === 1 && !nameParagraph)) {
    throwAts("Remove extra lines after the sign-off (keep only optional name).");
  }

  const slots = [
    greeting,
    ...between,
    signoff,
    ...(nameParagraph ? [nameParagraph] : []),
  ];
  const seen = new Set<string>();
  for (const text of slots) {
    if (seen.has(text)) {
      throwAts("Make each cover paragraph unique — duplicates block ATS replace.");
    }
    seen.add(text);
  }

  if (greeting.length < 8) {
    throwAts("Start with a clear greeting line (e.g. Dear Hiring Manager,).");
  }

  return {
    greeting,
    bodyParagraphs: between,
    signoff,
    nameParagraph,
  };
}
