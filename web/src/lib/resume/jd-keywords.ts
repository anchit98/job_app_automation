import type { Application, JdParsed } from "@/lib/db/types";
import type { FabricationFlag } from "@/lib/resume/fabrication";
import type { ResumeContent } from "@/lib/resume/fabrication";

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

export function buildJdKeywordBrief(application: Application): string {
  const parsed = parsedJd(application);
  const keywords = extractJdKeywords(parsed);

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
      "Swap JD terms into the master subheader/headline, bullets, and skills (replace words - do not append new titles/keywords to the subheader).",
      "Prioritize: role title, core responsibilities, required tools, and domain terms.",
    ].join("\n");
  }

  const lines = [
    "JD KEYWORD TARGETS - swap into master subheader, bullets, and skills where already true (do not append to the subheader):",
    "",
    `Must-have (${keywords.must_have.length}) - include at least 70% somewhere in the tailored resume:`,
    ...keywords.must_have.map((keyword) => `- ${keyword}`),
    "",
    `Nice-to-have (${keywords.nice_to_have.length}) - include where naturally grounded:`,
    ...keywords.nice_to_have.map((keyword) => `- ${keyword}`),
    "",
    `Tech stack (${keywords.tech_stack.length}) - reflect in relevant bullets/projects/skills:`,
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

/** Minimum share of must-have JD keywords - advisory only; does not block export. */
export const MUST_HAVE_KEYWORD_COVERAGE_MIN = 0.5;

export function checkJdKeywordCoverage(
  application: Application,
  generated: ResumeContent,
): FabricationFlag[] {
  const parsed = parsedJd(application);
  const keywords = extractJdKeywords(parsed);
  const mustHave = keywords.must_have.filter(Boolean);
  if (mustHave.length === 0) return [];

  const corpus = collectResumeCorpus(generated);
  const missing = mustHave.filter((kw) => !keywordInCorpus(kw, corpus));
  const coverage = 1 - missing.length / mustHave.length;

  if (coverage >= MUST_HAVE_KEYWORD_COVERAGE_MIN) return [];

  return [
    {
      id: "jd_keywords::missing_must_have",
      path: "jd_keywords",
      bullet: "",
      reason: "missing_jd_keyword",
      message: `ATS coverage low: ${missing.length} must-have JD keyword(s) not found - ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}. Prefer surgical keyword swaps (subheader: replace words only, do not append).`,
    },
  ];
}
