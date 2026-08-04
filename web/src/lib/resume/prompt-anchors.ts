import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  parseResumeWordBudget,
} from "@/lib/resume/word-budget";
import { estimateWrapLineCount } from "@/lib/resume/text-width";

/**
 * Prompt guide: maximize grounded JD keywords while locking Doc wrap line counts.
 */
export function buildResumeStructuralGuide(
  content: ResumeContent,
  _rules?: Record<string, unknown> | null,
  docLayout?: Record<string, unknown> | null,
): string {
  const budget = parseResumeWordBudget(docLayout, content);
  const lines: string[] = [
    "PRIMARY GOAL — MAXIMIZE JD KEYWORD COVERAGE (≥70% REQUIRED):",
    "- Pack as many JD must-have / tech keywords as possible into headline, bullets, and skills",
    "- Hard floor: at least 70% of JD target keywords (must-have + tech) that are grounded in MASTER must appear in the tailored resume",
    "- Prefer JD phrasing of facts already true in MASTER (or clearly implied by MASTER tools/domains)",
    "- Two different jobs must not look almost identical — rewrite in this JD's language",
    "- Skip only keywords with no grounding in MASTER (never invent employers, tools, certs, or metrics)",
    "",
    "HARD CONSTRAINT — SAME WRAP LINE COUNTS (never break this for keywords):",
    "- Same bullet count as MASTER; same skill line count as MASTER",
    "- Each experience/project bullet must keep the SAME Google Doc wrap line count as its MASTER bullet (neither more nor fewer visual lines)",
    "- Never longer than MASTER rendered width; never shorten enough to drop a wrap line",
    "- If a keyword cannot fit without changing wrap line count, place it in another bullet/skills line that still has room — do not grow or shrink that bullet's lines",
    `- Maximum ${budget.tailorable_words} words total across bullets + skills (never grow past master)`,
    "",
    "HOW TO HIT ≥70% WITHOUT CHANGING LINE COUNTS:",
    "- Swap weaker words/phrases for JD terms of similar length inside the same bullet",
    "- Lead with the JD-relevant angle when MASTER supports it",
    "- Reorder skills: JD-relevant items first within each Category line; swap weaker items for grounded JD tools",
    "- Keep each skill line's Category meaning intact — do not move Product items into Analytics/AI lines or vice versa",
    "- Do not invent tools absent from MASTER; do not add or remove whole skill lines",
    "",
    "VISIBLE CUSTOMIZATION (required):",
    "- Headline MUST change to target role from JD + 2–3 grounded domain/must-have terms",
    "- Rewrite most experience/project bullets so they read for this JD (same metrics/outcomes)",
    "",
    "SECTIONS TO TAILOR (only these):",
    "- Headline (if present)",
    "- Work Experience / Experience bullets",
    "- Projects and Case Studies bullets (both appear under projects[] here)",
    "- Skills lines",
    "- Do NOT rewrite Education, contact, or fixed employer/title header lines",
    "",
    "ONE PAGE + COMPLETENESS:",
    "- One page only — wrap line lock protects layout",
    "- NEVER end a bullet mid-sentence or mid-clause",
    "- ≥70% grounded JD keyword coverage is required; wrap line count is the hard stop on how you fit them",
    "",
    "ATS STRATEGY:",
    "- Cover must-haves first, then tech stack, then nice-to-haves — all within wrap-line limits until ≥70% is met",
    "- Keep every metric and outcome from MASTER - never invent numbers",
    "- Skills: match MASTER shape — if MASTER has `Category: a, b`, keep that Category: prefix and REPLACE/REORDER items after the colon; if MASTER is a flat list (`a, b, c`), keep a flat list (never invent `Category:` or repeat the list before a colon)",
    "- Skills: never duplicate the same skill token in one line",
    "",
    "JSON OUTPUT:",
    '- { "headline", "experience": [{ "bullets": [...] }, ...], "projects": [...], "skills": [...] }',
    "- experience/projects: ONLY bullets arrays (same lengths as MASTER)",
    "- projects[] includes Projects and Case Studies from the master Doc",
    "- Every bullet must be a finished sentence ending in . ! or ?",
    "- Complete full JSON in one reply",
    "",
    `MASTER LINES (reference ~${budget.work_through_skills_total} words - ceiling ${budget.tailorable_words}):`,
  ];

  if (content.headline?.trim()) {
    lines.push(`## headline (subheader)`);
    lines.push(`  [0]: ${JSON.stringify(content.headline)}`);
  }
  content.experience.forEach((exp, i) => {
    lines.push(`## experience[${i}] ${exp.company} (${exp.bullets.length} bullets)`);
    exp.bullets.forEach((bullet, j) => {
      const wrapLines = estimateWrapLineCount(bullet);
      lines.push(
        `  [${j}] (keep ${wrapLines} Doc wrap line${wrapLines === 1 ? "" : "s"}): ${JSON.stringify(bullet)}`,
      );
    });
  });

  content.projects.forEach((project, i) => {
    lines.push(
      `## projects[${i}] ${project.name} (Projects / Case Studies)`,
    );
    project.bullets.forEach((bullet, j) => {
      const wrapLines = estimateWrapLineCount(bullet);
      lines.push(
        `  [${j}] (keep ${wrapLines} Doc wrap line${wrapLines === 1 ? "" : "s"}): ${JSON.stringify(bullet)}`,
      );
    });
  });

  lines.push("## skills");
  content.skills.forEach((line, i) => {
    lines.push(`  [${i}]: ${JSON.stringify(line)}`);
  });

  lines.push(
    "",
    `Education: ${content.education.length} entries - omit from JSON`,
  );

  return lines.join("\n");
}
