import type { CoverLetterContent } from "@/lib/cover-letter/validate";

/** Leading salutation lines the app inserts via the Google Doc template. */
const GREETING_LINE =
  /^Dear\s+[^,\n]+(?:\s+Hiring\s+(?:Team|Manager)|\s+Recruiting\s+Team)?,?\s*(?:\n+|$)/i;

const SIGNOFF_BLOCK =
  /(?:\n\n|\n)(?:Sincerely|Warm regards|Best regards|Kind regards|Regards|Thank you),?\s*\n[\s\S]*$/i;

/** Quantified outcomes to bold in exported Google Docs. */
export const COVER_LETTER_METRIC_PATTERN =
  /\$\d{1,3}(?:,\d{3})*(?:\.\d+)?[KMB]?|\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:%|\+|x|X)|\b\d+(?:\.\d+)?[KMB]\+?\b|\b\d+\+\s*(?:years?|yrs?|months?|mos?|weeks?|days?)\b|\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?|months?|mos?|weeks?|days?|hours?|hrs?|minutes?|mins?|users?|customers?|clients?|products?|features?|markets?|countries?|engineers?|teams?|people|transactions?|requests?|queries?|ms|seconds?|sec)\b|\b\d{1,3}(?:,\d{3})+\+?/gi;

export function stripCoverLetterGreeting(text: string): string {
  let result = text.trim();
  while (GREETING_LINE.test(result)) {
    result = result.replace(GREETING_LINE, "").trim();
  }
  return result;
}

export function stripCoverLetterSignoff(text: string): string {
  return text.replace(SIGNOFF_BLOCK, "").trim();
}

export function normalizeCoverLetterSection(text: string): string {
  return stripCoverLetterSignoff(stripCoverLetterGreeting(text));
}

/** Remove duplicate greeting/sign-off from structured sections before export. */
export function normalizeCoverLetterContent(
  content: CoverLetterContent,
): CoverLetterContent {
  const normalized: CoverLetterContent = {
    ...content,
    opening_hook: normalizeCoverLetterSection(content.opening_hook),
    why_this_role: normalizeCoverLetterSection(content.why_this_role),
    evidence_points: content.evidence_points.map(normalizeCoverLetterSection),
    why_this_company: normalizeCoverLetterSection(content.why_this_company),
    cta: normalizeCoverLetterSection(content.cta),
  };

  if (content.body?.trim()) {
    const lines = content.body.split(/\n\n+/);
    const withoutLeadingGreeting =
      lines.length > 0 && /^Dear\s/i.test(lines[0])
        ? lines.slice(1)
        : lines;
    normalized.body = withoutLeadingGreeting.join("\n\n").trim();
  }

  return normalized;
}

export function sectionStartsWithGreeting(text: string): boolean {
  return /^Dear\s/i.test(text.trim());
}

export function countMetricsInText(text: string): number {
  const matches = text.match(COVER_LETTER_METRIC_PATTERN);
  return matches?.length ?? 0;
}

export function extractResumeMetricTokens(resume: {
  experience?: Array<{ bullets?: string[] }>;
  projects?: Array<{ bullets?: string[] }>;
}): string[] {
  const bullets: string[] = [];
  for (const exp of resume.experience ?? []) {
    bullets.push(...(exp.bullets ?? []));
  }
  for (const project of resume.projects ?? []) {
    bullets.push(...(project.bullets ?? []));
  }

  const tokens = new Set<string>();
  for (const bullet of bullets) {
    const matches = bullet.match(COVER_LETTER_METRIC_PATTERN);
    for (const m of matches ?? []) {
      tokens.add(m.toLowerCase());
    }
  }
  return [...tokens];
}
