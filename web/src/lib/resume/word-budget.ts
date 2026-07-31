import type { ResumeContent } from "@/lib/resume/fabrication";
import { countWords } from "@/lib/resume/bullet-layout";

/** Max words across experience bullets + project bullets + skills (WORK EXPERIENCE → SKILLS). */
export const TAILORABLE_WORD_CEILING = 400;

/** Words in all tailored fields: experience bullets, project bullets, skills. */
export function countTailorableWords(content: ResumeContent): number {
  let total = 0;
  for (const role of content.experience) {
    for (const bullet of role.bullets) {
      total += countWords(bullet);
    }
  }
  for (const project of content.projects) {
    for (const bullet of project.bullets) {
      total += countWords(bullet);
    }
  }
  for (const line of content.skills) {
    total += countWords(line);
  }
  return total;
}

export interface ResumeWordBudget {
  /** Master doc reference - words in WORK EXPERIENCE → SKILLS body. */
  work_through_skills_total: number;
  fixed_line_words: number;
  /** Hard ceiling for tailored JSON (bullets + skills). */
  tailorable_words: number;
}

export function parseResumeWordBudget(
  docLayout: Record<string, unknown> | null | undefined,
  master: ResumeContent,
): ResumeWordBudget {
  const raw = docLayout?.word_budget;
  let masterTotal = countTailorableWords(master);
  let fixedLineWords = 0;

  if (raw && typeof raw === "object") {
    const budget = raw as Partial<ResumeWordBudget>;
    if (typeof budget.work_through_skills_total === "number") {
      masterTotal = budget.work_through_skills_total;
    }
    if (typeof budget.fixed_line_words === "number") {
      fixedLineWords = budget.fixed_line_words;
    }
  }

  return {
    work_through_skills_total: masterTotal,
    fixed_line_words: fixedLineWords,
    // Never force the resume below the master's own length — that caused
    // mid-sentence chops. Allow at least the master total (and the 400 floor).
    tailorable_words: Math.max(TAILORABLE_WORD_CEILING, masterTotal),
  };
}

export function isWithinTailorableWordCeiling(
  content: ResumeContent,
  ceiling: number = TAILORABLE_WORD_CEILING,
): boolean {
  return countTailorableWords(content) <= ceiling;
}
