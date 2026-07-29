import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  parseResumeWordBudget,
  TAILORABLE_WORD_CEILING,
} from "@/lib/resume/word-budget";

/**
 * Prompt guide: surgical keyword swap + 400-word ceiling.
 */
export function buildResumeStructuralGuide(
  content: ResumeContent,
  rules?: Record<string, unknown> | null,
  docLayout?: Record<string, unknown> | null,
): string {
  const budget = parseResumeWordBudget(docLayout, content);
  const lines: string[] = [
    "EDIT MODE (SUBHEADER + WORK EXPERIENCE → SKILLS):",
    "- Copy each MASTER line below as the starting text",
    "- Replace words/phrases with JD keywords only where the fact already exists - do NOT rewrite or append",
    "- Subheader (headline): same rule - swap words inside the master line; do not add new titles or keyword stacks",
    "- If no clean keyword fit, return the master line unchanged",
    `- Maximum ${TAILORABLE_WORD_CEILING} words total across bullets + skills (shorter is fine)`,
    "",
    "ATS STRATEGY:",
    "- Prefer minimal synonym/phrase swaps over new sentences",
    "- Keep every metric and outcome from MASTER - never invent numbers",
    "- Skills: keep each Category: prefix; reorder/swap items after the colon for JD terms",
    "",
    "JSON OUTPUT:",
    '- { "headline", "experience": [{ "bullets": [...] }, ...], "projects": [...], "skills": [...] }',
    "- experience/projects: ONLY bullets arrays",
    "- Complete full JSON in one reply",
    "",
    `MASTER LINES (reference ~${budget.work_through_skills_total} words - ceiling ${TAILORABLE_WORD_CEILING}):`,
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
