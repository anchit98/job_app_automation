import { z } from "zod";
import {
  countMetricsInText,
  extractResumeMetricTokens,
  normalizeCoverLetterSection,
  sectionContainsSignoff,
  sectionStartsWithGreeting,
} from "@/lib/cover-letter/normalize";

export const coverLetterContentSchema = z.object({
  opening_hook: z.string().min(1),
  why_this_role: z.string().min(1),
  evidence_points: z.array(z.string().min(1)).min(2).max(3),
  why_this_company: z.string().min(1),
  cta: z.string().min(1),
  body: z.string().min(100),
  body_html: z.string().optional(),
});

export type CoverLetterContent = z.infer<typeof coverLetterContentSchema>;

export interface CoverLetterValidationIssue {
  path: string;
  message: string;
}

/**
 * Extract resume bullet phrases (4+ consecutive words) for substring matching.
 */
export function extractResumePhrases(resume: {
  experience?: Array<{ bullets?: string[] }>;
  projects?: Array<{ bullets?: string[] }>;
  skills?: string[];
}): string[] {
  const bullets: string[] = [];
  for (const exp of resume.experience ?? []) {
    bullets.push(...(exp.bullets ?? []));
  }
  for (const project of resume.projects ?? []) {
    bullets.push(...(project.bullets ?? []));
  }

  const phrases: string[] = [];
  for (const bullet of bullets) {
    const words = bullet
      .replace(/[^\w\s%$.,-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (let i = 0; i <= words.length - 4; i++) {
      phrases.push(words.slice(i, i + 4).join(" "));
    }
    if (words.length >= 3) {
      phrases.push(words.slice(0, 3).join(" "));
    }
  }
  return [...new Set(phrases.map((p) => p.toLowerCase()))];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

export function checkResumeReferencesInCoverLetter(
  resume: {
    experience?: Array<{ bullets?: string[] }>;
    projects?: Array<{ bullets?: string[] }>;
  },
  body: string,
  minMatches = 2,
): CoverLetterValidationIssue | null {
  const phrases = extractResumePhrases(resume);
  const normalizedBody = normalizeForMatch(body);
  let matches = 0;

  for (const phrase of phrases) {
    if (phrase.length < 8) continue;
    if (normalizedBody.includes(phrase)) {
      matches++;
      if (matches >= minMatches) return null;
    }
  }

  return {
    path: "body",
    message: `Cover letter should reference at least ${minMatches} specific achievements from the tailored resume. Found ${matches}. Cite concrete bullets with metrics from the resume.`,
  };
}

export function checkTargetCompanyInBody(
  targetCompany: string | null | undefined,
  body: string,
  options?: { skip?: boolean },
): CoverLetterValidationIssue | null {
  if (options?.skip) return null;
  const company = targetCompany?.trim();
  if (!company || company.length < 2) return null;

  const normalizedBody = normalizeForMatch(body);
  const normalizedCompany = normalizeForMatch(company);
  if (normalizedBody.includes(normalizedCompany)) return null;

  return {
    path: "body",
    message: `Cover letter body must mention the target company "${company}" at least once.`,
  };
}

const PLACEHOLDER_REGEX = /\[[A-Z][A-Z0-9_\s]{2,}\]|\{\{[^}]+\}\}/;

export function checkNoPlaceholders(body: string): CoverLetterValidationIssue | null {
  if (PLACEHOLDER_REGEX.test(body)) {
    return {
      path: "body",
      message:
        "Cover letter contains unresolved placeholders like [COMPANY] or [NAME]. Replace them with real values.",
    };
  }
  return null;
}

export function checkNoGreetingInSections(
  content: Omit<CoverLetterContent, "body">,
): CoverLetterValidationIssue | null {
  const fields: Array<[string, string]> = [
    ["opening_hook", content.opening_hook],
    ["why_this_role", content.why_this_role],
    ...content.evidence_points.map(
      (p, i) => [`evidence_points[${i}]`, p] as [string, string],
    ),
    ["why_this_company", content.why_this_company],
    ["cta", content.cta],
  ];

  for (const [path, text] of fields) {
    if (sectionStartsWithGreeting(text)) {
      return {
        path,
        message:
          'Do not include a greeting (e.g. "Dear Hiring Team,") in section fields - the app inserts the greeting from the Google Doc template.',
      };
    }
  }
  return null;
}

export function checkNoSignoffInSections(
  content: Omit<CoverLetterContent, "body">,
): CoverLetterValidationIssue | null {
  const fields: Array<[string, string]> = [
    ["opening_hook", content.opening_hook],
    ["why_this_role", content.why_this_role],
    ...content.evidence_points.map(
      (p, i) => [`evidence_points[${i}]`, p] as [string, string],
    ),
    ["why_this_company", content.why_this_company],
    ["cta", content.cta],
  ];

  for (const [path, text] of fields) {
    if (sectionContainsSignoff(text)) {
      return {
        path,
        message:
          'Do not include a sign-off (e.g. "Warm regards," / name) in section fields - the Google Doc template already has the closing.',
      };
    }
  }
  return null;
}

export function checkMetricsHighlighted(
  content: Omit<CoverLetterContent, "body">,
  resume: {
    experience?: Array<{ bullets?: string[] }>;
    projects?: Array<{ bullets?: string[] }>;
  },
): CoverLetterValidationIssue | null {
  const evidenceText = content.evidence_points.join(" ");
  const metricCount = countMetricsInText(evidenceText);
  if (metricCount < 2) {
    return {
      path: "evidence_points",
      message:
        "Each evidence paragraph should cite quantified outcomes from the resume (%, $, scale, time saved, years of experience, user counts, etc.). Include at least two metrics across evidence_points.",
    };
  }

  const resumeMetrics = extractResumeMetricTokens(resume);
  if (resumeMetrics.length === 0) return null;

  const normalizedEvidence = evidenceText.toLowerCase();
  const matched = resumeMetrics.filter((token) =>
    normalizedEvidence.includes(token),
  );
  if (matched.length < 1) {
    return {
      path: "evidence_points",
      message:
        "Evidence paragraphs must reuse specific numbers/metrics from the tailored resume bullets - do not invent metrics.",
    };
  }
  return null;
}

export function validateCoverLetterContent(
  content: CoverLetterContent,
  context: {
    resume: {
      experience?: Array<{ bullets?: string[] }>;
      projects?: Array<{ bullets?: string[] }>;
    };
    targetCompany: string | null;
    skipCompanyCheck?: boolean;
  },
): CoverLetterValidationIssue[] {
  const issues: CoverLetterValidationIssue[] = [];

  const greetingIssue = checkNoGreetingInSections(content);
  if (greetingIssue) issues.push(greetingIssue);

  const signoffIssue = checkNoSignoffInSections(content);
  if (signoffIssue) issues.push(signoffIssue);

  const metricsIssue = checkMetricsHighlighted(content, context.resume);
  if (metricsIssue) issues.push(metricsIssue);

  const placeholder = checkNoPlaceholders(content.body);
  if (placeholder) issues.push(placeholder);

  const companyIssue = checkTargetCompanyInBody(
    context.targetCompany,
    content.body,
    { skip: context.skipCompanyCheck },
  );
  if (companyIssue) issues.push(companyIssue);

  const resumeIssue = checkResumeReferencesInCoverLetter(
    context.resume,
    content.body,
  );
  if (resumeIssue) issues.push(resumeIssue);

  return issues;
}

export function assembleBodyFromSections(
  content: Omit<CoverLetterContent, "body"> & { body?: string },
  _fullName: string,
  _targetCompany: string,
): string {
  if (content.body?.trim()) {
    const cleaned = normalizeCoverLetterSection(
      stripBodyEnvelope(content.body),
    );
    if (cleaned.length >= 80) return cleaned;
  }

  // Body is reference-only. Template already has greeting + sign-off — never append them.
  const paragraphs = [
    normalizeCoverLetterSection(content.opening_hook),
    normalizeCoverLetterSection(content.why_this_role),
    ...content.evidence_points.map(normalizeCoverLetterSection),
    normalizeCoverLetterSection(
      `${content.why_this_company} ${content.cta}`.trim(),
    ),
  ];
  return paragraphs.filter(Boolean).join("\n\n");
}

function stripBodyEnvelope(body: string): string {
  let text = body.trim();
  text = text.replace(
    /^Dear\s+[^,\n]+(?:\s+Hiring\s+(?:Team|Manager))?,?\s*(?:\n\n+|\n+)/i,
    "",
  );
  return text;
}
