import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  countWords,
  healTruncatedBullet,
} from "@/lib/resume/bullet-layout";
import type { ResumeWordBudget } from "@/lib/resume/word-budget";
import {
  countTailorableWords,
  parseResumeWordBudget,
  TAILORABLE_WORD_CEILING,
} from "@/lib/resume/word-budget";

type MutableLineRef =
  | { kind: "experience"; expIndex: number; bulletIndex: number }
  | { kind: "project"; projIndex: number; bulletIndex: number }
  | { kind: "skill"; skillIndex: number };

function collectLineRefs(content: ResumeContent): MutableLineRef[] {
  const refs: MutableLineRef[] = [];
  content.experience.forEach((exp, expIndex) => {
    exp.bullets.forEach((_, bulletIndex) => {
      refs.push({ kind: "experience", expIndex, bulletIndex });
    });
  });
  content.projects.forEach((proj, projIndex) => {
    proj.bullets.forEach((_, bulletIndex) => {
      refs.push({ kind: "project", projIndex, bulletIndex });
    });
  });
  content.skills.forEach((_, skillIndex) => {
    refs.push({ kind: "skill", skillIndex });
  });
  return refs;
}

function getLineText(content: ResumeContent, ref: MutableLineRef): string {
  if (ref.kind === "experience") {
    return content.experience[ref.expIndex]?.bullets[ref.bulletIndex] ?? "";
  }
  if (ref.kind === "project") {
    return content.projects[ref.projIndex]?.bullets[ref.bulletIndex] ?? "";
  }
  return content.skills[ref.skillIndex] ?? "";
}

function setLineText(
  content: ResumeContent,
  ref: MutableLineRef,
  text: string,
): void {
  if (ref.kind === "experience") {
    const role = content.experience[ref.expIndex];
    if (role) role.bullets[ref.bulletIndex] = text;
    return;
  }
  if (ref.kind === "project") {
    const project = content.projects[ref.projIndex];
    if (project) project.bullets[ref.bulletIndex] = text;
    return;
  }
  content.skills[ref.skillIndex] = text;
}

function getMasterLineText(master: ResumeContent, ref: MutableLineRef): string {
  if (ref.kind === "experience") {
    return (
      master.experience[ref.expIndex]?.bullets[ref.bulletIndex] ?? ""
    );
  }
  if (ref.kind === "project") {
    return master.projects[ref.projIndex]?.bullets[ref.bulletIndex] ?? "";
  }
  return master.skills[ref.skillIndex] ?? "";
}

function popLastWord(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? "";
  words.pop();
  let result = words.join(" ");
  if (result && !/[.!?]$/.test(result)) result = `${result}.`;
  return result;
}

function healAllLines(content: ResumeContent, master: ResumeContent): void {
  for (const ref of collectLineRefs(content)) {
    const masterLine = getMasterLineText(master, ref);
    const current = getLineText(content, ref);
    if (!masterLine) continue;
    setLineText(content, ref, healTruncatedBullet(current, masterLine));
  }
}

function enforceSkillPrefix(masterLine: string, genLine: string): string {
  const masterPrefix = masterLine.split(":")[0]?.trim();
  if (!masterPrefix) return genLine;

  const colonIdx = genLine.indexOf(":");
  const tail =
    colonIdx >= 0
      ? genLine.slice(colonIdx + 1).trim()
      : genLine.trim();

  return tail ? `${masterPrefix}: ${tail}` : `${masterPrefix}:`;
}

/** Trim bullets + skills when total exceeds the word ceiling. */
export function fitResumeToWordBudget(
  generated: ResumeContent,
  master: ResumeContent,
  budget: ResumeWordBudget,
): ResumeContent {
  const fitted: ResumeContent = {
    ...generated,
    experience: generated.experience.map((exp) => ({
      ...exp,
      bullets: [...(exp.bullets ?? [])],
    })),
    projects: generated.projects.map((proj) => ({
      ...proj,
      bullets: [...(proj.bullets ?? [])],
    })),
    skills: [...generated.skills],
  };

  healAllLines(fitted, master);

  const target = budget.tailorable_words ?? TAILORABLE_WORD_CEILING;
  let guard = 0;
  while (countTailorableWords(fitted) > target && guard < 5000) {
    guard++;
    const refs = collectLineRefs(fitted);
    let longest: { ref: MutableLineRef; words: number } | null = null;
    for (const ref of refs) {
      const words = countWords(getLineText(fitted, ref));
      if (!longest || words > longest.words) {
        longest = { ref, words };
      }
    }
    if (!longest || longest.words <= 3) break;
    setLineText(
      fitted,
      longest.ref,
      popLastWord(getLineText(fitted, longest.ref)),
    );
  }

  fitted.skills = master.skills.map((masterLine, i) => {
    const genLine = fitted.skills[i] ?? masterLine;
    return enforceSkillPrefix(masterLine, genLine);
  });

  return fitted;
}

export function fitResumeToMasterLayout(
  generated: ResumeContent,
  master: ResumeContent,
  docLayout?: Record<string, unknown> | null,
): ResumeContent {
  const budget = parseResumeWordBudget(docLayout, master);
  return fitResumeToWordBudget(generated, master, budget);
}

export { countWords };
