import type { Application, JdParsed } from "@/lib/db/types";
import type { FabricationFlag } from "@/lib/resume/fabrication";
import type { ResumeContent } from "@/lib/resume/fabrication";

/** Minimum share of JD target keywords required before resume accept. */
export const JD_KEYWORD_COVERAGE_MIN = 0.7;

/** @deprecated Use JD_KEYWORD_COVERAGE_MIN */
export const MUST_HAVE_KEYWORD_COVERAGE_MIN = JD_KEYWORD_COVERAGE_MIN;

function normalizeKeyword(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+\-#/ ]/g, " ").replace(/\s+/g, " ").trim();
}

function keywordInCorpus(keyword: string, corpus: string): boolean {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return true;
  if (corpus.includes(normalized)) return true;

  const tokens = normalized.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return true;
  const matched = tokens.filter((token) => corpus.includes(token));
  return matched.length >= Math.ceil(tokens.length * 0.6);
}

function collectResumeCorpus(content: ResumeContent): string {
  return normalizeKeyword(
    [
      content.headline ?? "",
      ...content.experience.flatMap((role) => role.bullets),
      ...content.projects.flatMap((project) => project.bullets),
      ...content.skills,
    ].join(" "),
  );
}

function parsedJd(application: Application): JdParsed | null {
  return application.jd_parsed ?? null;
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const keyword = raw?.trim();
    if (!keyword) continue;
    const key = normalizeKeyword(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out;
}

export function extractJdKeywords(parsed: JdParsed | null): {
  must_have: string[];
  nice_to_have: string[];
  tech_stack: string[];
  responsibilities: string[];
  requirements: string[];
} {
  if (!parsed) {
    return {
      must_have: [],
      nice_to_have: [],
      tech_stack: [],
      responsibilities: [],
      requirements: [],
    };
  }
  return {
    must_have: (parsed.must_have_keywords ?? []).filter(Boolean),
    nice_to_have: (parsed.nice_to_have_keywords ?? []).filter(Boolean),
    tech_stack: (parsed.tech_stack ?? []).filter(Boolean),
    responsibilities: (parsed.responsibilities ?? []).filter(Boolean),
    requirements: (parsed.requirements ?? []).filter(Boolean),
  };
}

/** JD keywords used for the hard coverage floor (must-have + tech). */
export function jdCoverageTargetKeywords(parsed: JdParsed | null): string[] {
  const keywords = extractJdKeywords(parsed);
  const primary = dedupeKeywords([
    ...keywords.must_have,
    ...keywords.tech_stack,
  ]);
  if (primary.length > 0) return primary;
  return dedupeKeywords([
    ...keywords.must_have,
    ...keywords.tech_stack,
    ...keywords.nice_to_have,
  ]);
}

export function buildJdKeywordBrief(application: Application): string {
  const parsed = parsedJd(application);
  const keywords = extractJdKeywords(parsed);
  const targets = jdCoverageTargetKeywords(parsed);
  const minPct = Math.round(JD_KEYWORD_COVERAGE_MIN * 100);

  if (
    !parsed &&
    !application.jd_raw?.trim()
  ) {
    return "No job description on file. Tailor bullets using the application company/role only.";
  }

  if (
    keywords.must_have.length === 0 &&
    keywords.nice_to_have.length === 0 &&
    keywords.tech_stack.length === 0
  ) {
    return [
      "No structured JD keywords parsed yet.",
      "Read the raw job description in jd_content and extract role-specific keywords.",
      `PRIMARY GOAL: include at least ${minPct}% of those JD keywords in headline/bullets/skills using only master-grounded facts (do not invent tools).`,
      "HARD CONSTRAINT: keep each experience/project bullet on the same Doc wrap line count as MASTER.",
      "Prioritize: role title, core responsibilities, required tools the candidate already has, and domain terms.",
    ].join("\n");
  }

  const requiredCount = Math.ceil(targets.length * JD_KEYWORD_COVERAGE_MIN);

  const lines = [
    `PRIMARY GOAL — include at least ${minPct}% of JD keywords (must-have + tech) by rewriting MASTER points.`,
    `Hard floor: at least ${requiredCount} of ${targets.length} target keywords must appear in the tailored resume.`,
    "HARD CONSTRAINT — keep each experience/project bullet on the SAME Doc wrap line count as MASTER (neither more nor fewer).",
    "Swap similar-length phrases for JD terms; if a keyword won't fit without changing wrap lines, place it in another bullet/skills line.",
    "Only use keywords already grounded in MASTER (skills or bullets). Never invent unfamiliar tools/employers.",
    "",
    `Must-have (${keywords.must_have.length}) — cover aggressively when grounded in MASTER:`,
    ...keywords.must_have.map((keyword) => `- ${keyword}`),
    "",
    `Nice-to-have (${keywords.nice_to_have.length}) — include when grounded and wrap-line-safe:`,
    ...keywords.nice_to_have.map((keyword) => `- ${keyword}`),
    "",
    `Tech stack (${keywords.tech_stack.length}) — weave in when MASTER already shows that tool/domain; Skills: reorder/swap within Category lines without changing wrap length:`,
    ...keywords.tech_stack.map((tool) => `- ${tool}`),
  ];

  if (keywords.responsibilities.length > 0) {
    lines.push(
      "",
      "Top responsibilities to mirror in experience bullets:",
      ...keywords.responsibilities.slice(0, 8).map((item) => `- ${item}`),
    );
  }

  if (keywords.requirements.length > 0) {
    lines.push(
      "",
      "Key requirements to address:",
      ...keywords.requirements.slice(0, 6).map((item) => `- ${item}`),
    );
  }

  if (parsed?.role?.trim()) {
    lines.push("", `Target role title: ${parsed.role.trim()}`);
  }

  return lines.join("\n");
}

export type JdKeywordCoverageScore = {
  targets: string[];
  grounded: string[];
  matched: string[];
  missingGrounded: string[];
  requiredCount: number;
  matchedCount: number;
  coverage: number;
  passes: boolean;
};

/**
 * Score JD keyword coverage.
 * Required count = min(ceil(70% of targets), grounded-in-master count)
 * so we never demand invented tools, but still enforce ≥70% when master supports it.
 */
export function scoreJdKeywordCoverage(
  application: Application,
  generated: ResumeContent,
  master?: ResumeContent | null,
): JdKeywordCoverageScore {
  const targets = jdCoverageTargetKeywords(parsedJd(application));
  if (targets.length === 0) {
    return {
      targets: [],
      grounded: [],
      matched: [],
      missingGrounded: [],
      requiredCount: 0,
      matchedCount: 0,
      coverage: 1,
      passes: true,
    };
  }

  const generatedCorpus = collectResumeCorpus(generated);
  const masterCorpus = master
    ? collectResumeCorpus(master)
    : generatedCorpus;

  const grounded = targets.filter((kw) => keywordInCorpus(kw, masterCorpus));
  const matched = targets.filter((kw) => keywordInCorpus(kw, generatedCorpus));
  const missingGrounded = grounded.filter(
    (kw) => !keywordInCorpus(kw, generatedCorpus),
  );

  const requiredCount = Math.min(
    Math.ceil(targets.length * JD_KEYWORD_COVERAGE_MIN),
    grounded.length,
  );
  const matchedCount = matched.length;
  const coverage =
    targets.length === 0 ? 1 : matchedCount / targets.length;
  const passes = matchedCount >= requiredCount;

  return {
    targets,
    grounded,
    matched,
    missingGrounded,
    requiredCount,
    matchedCount,
    coverage,
    passes,
  };
}

export function checkJdKeywordCoverage(
  application: Application,
  generated: ResumeContent,
  master?: ResumeContent | null,
): FabricationFlag[] {
  const score = scoreJdKeywordCoverage(application, generated, master);
  if (score.passes) return [];

  const minPct = Math.round(JD_KEYWORD_COVERAGE_MIN * 100);
  const missing = score.missingGrounded.slice(0, 10);
  const missingText =
    missing.length > 0
      ? missing.join(", ") + (score.missingGrounded.length > 10 ? "…" : "")
      : score.targets
          .filter((kw) => !score.matched.includes(kw))
          .slice(0, 10)
          .join(", ");

  return [
    {
      id: "jd_keywords::below_min_coverage",
      path: "jd_keywords",
      bullet: "",
      reason: "missing_jd_keyword",
      message:
        `JD keyword coverage below ${minPct}%: found ${score.matchedCount}/${score.targets.length} ` +
        `(need ≥${score.requiredCount}). Rewrite MASTER bullets/skills to include missing grounded terms` +
        `${missingText ? ` — ${missingText}` : ""}. Keep each bullet's Doc wrap line count unchanged; never invent unfamiliar tools.`,
    },
  ];
}
