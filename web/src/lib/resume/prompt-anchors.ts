import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  parseResumeWordBudget,
} from "@/lib/resume/word-budget";

/**
 * Prompt guide: maximize JD keyword coverage via in-place word swaps only.
 * Never grow line count — one-page PDF is mandatory.
 */
export function buildResumeStructuralGuide(
  content: ResumeContent,
  rules?: Record<string, unknown> | null,
  docLayout?: Record<string, unknown> | null,
): string {
  const budget = parseResumeWordBudget(docLayout, content);
  const lines: string[] = [
    "EDIT MODE — REPLACE WORDS, DO NOT ADD (ONE PAGE):",
    "- Copy each MASTER line below as the starting text",
    "- REPLACE existing words/phrases with JD keywords where the fact is already true",
    "- Do NOT append, stack, or insert extra clauses — that increases line wrap and breaks one page",
    "- Same bullet count as MASTER; same skill line count as MASTER",
    "- Each output line character length must be ≤ the corresponding MASTER line (prefer shorter)",
    "- Subheader (headline): replace words inside the master line only; never add titles or keyword stacks",
    "- If a JD keyword cannot fit by replacing words without inventing or lengthening, skip it or swap it into skills by replacing an existing skill item",
    `- Maximum ${budget.tailorable_words} words total across bullets + skills (never grow past master)`,
    "",
    "LINE COUNT / ONE PAGE (non-negotiable):",
    "- One page only. Growing any line past MASTER length risks a second page — forbidden",
    "- Prefer a shorter complete sentence over a longer keyword-stuffed line",
    "- NEVER end a bullet mid-sentence or mid-clause",
    "- Completeness + same-or-shorter length beats keyword coverage",
    "",
    "ATS STRATEGY:",
    "- Synonym/phrase REPLACE only — not new sentences",
    "- Keep every metric and outcome from MASTER - never invent numbers",
    "- Skills: keep each Category: prefix; REPLACE items after the colon (drop least-relevant master items if you add a JD term so length stays ≤ master)",
    "",
    "JSON OUTPUT:",
    '- { "headline", "experience": [{ "bullets": [...] }, ...], "projects": [...], "skills": [...] }',
    "- experience/projects: ONLY bullets arrays (same lengths as MASTER)",
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
      lines.push(`  [${j}]: ${JSON.stringify(bullet)}`);
    });
  });

  content.projects.forEach((project, i) => {
    lines.push(`## projects[${i}] ${project.name}`);
    project.bullets.forEach((bullet, j) => {
      lines.push(`  [${j}]: ${JSON.stringify(bullet)}`);
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
