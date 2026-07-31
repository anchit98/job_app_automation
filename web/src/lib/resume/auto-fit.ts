import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  countWords,
  healTruncatedBullet,
  isIncompleteBullet,
  splitSentences,
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

function refKey(ref: MutableLineRef): string {
  if (ref.kind === "experience") {
    return `experience:${ref.expIndex}:${ref.bulletIndex}`;
  }
  if (ref.kind === "project") {
    return `project:${ref.projIndex}:${ref.bulletIndex}`;
  }
  return `skill:${ref.skillIndex}`;
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Shorten a line without leaving mid-sentence fragments.
 * Prefers dropping a trailing sentence, then master (if shorter), then a
 * trailing comma clause — never blind word chops with a fake period.
 */
function shortenLineKeepingComplete(
  text: string,
  master: string,
  kind: MutableLineRef["kind"],
): string | null {
  const current = text.trim();
  const masterText = master.trim();
  if (!current) return null;
  const currentWords = countWords(current);

  if (kind === "skill") {
    const colon = current.indexOf(":");
    if (colon >= 0) {
      const prefix = current.slice(0, colon + 1).trimEnd();
      const items = current
        .slice(colon + 1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length > 1) {
        items.pop();
        const next = items.length
          ? `${prefix} ${items.join(", ")}`
          : `${prefix}`;
        if (countWords(next) < currentWords) return next;
      }
    }
  }

  const sentences = splitSentences(current);
  if (sentences.length > 1) {
    const next = ensureTerminalPunctuation(
      sentences.slice(0, -1).join(" ").trim(),
    );
    if (
      countWords(next) < currentWords &&
      next &&
      !isIncompleteBullet(next)
    ) {
      return next;
    }
  }

  if (masterText && countWords(masterText) < currentWords) {
    return masterText;
  }

  const lastComma = current.lastIndexOf(",");
  if (lastComma > 24) {
    let candidate = ensureTerminalPunctuation(current.slice(0, lastComma).trim());
    if (
      countWords(candidate) < currentWords &&
      !isIncompleteBullet(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function healAllLines(
  content: ResumeContent,
  master: ResumeContent,
  options?: { restorePrefixCuts?: boolean },
): void {
  for (const ref of collectLineRefs(content)) {
    const masterLine = getMasterLineText(master, ref);
    const current = getLineText(content, ref);
    if (!masterLine) continue;
    let healed = healTruncatedBullet(current, masterLine, options);
    if (isIncompleteBullet(healed)) {
      healed = masterLine;
    }
    setLineText(content, ref, healed);
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

  // Restore LLM mid-phrase cuts first (including silent prefix chops).
  healAllLines(fitted, master, { restorePrefixCuts: true });

  const target = budget.tailorable_words ?? TAILORABLE_WORD_CEILING;
  const shrinkPass = () => {
    const unsinkable = new Set<string>();
    let guard = 0;
    while (countTailorableWords(fitted) > target && guard < 5000) {
      guard++;
      const refs = collectLineRefs(fitted).filter(
        (ref) => !unsinkable.has(refKey(ref)),
      );
      // Prefer trimming skills before narrative bullets when tied.
      let longest: { ref: MutableLineRef; words: number; rank: number } | null =
        null;
      for (const ref of refs) {
        const words = countWords(getLineText(fitted, ref));
        const rank = ref.kind === "skill" ? words + 8 : words;
        if (
          !longest ||
          rank > longest.rank ||
          (rank === longest.rank && words > longest.words)
        ) {
          longest = { ref, words, rank };
        }
      }
      if (!longest || longest.words <= 3) break;

      const current = getLineText(fitted, longest.ref);
      const masterLine = getMasterLineText(master, longest.ref);
      const shortened = shortenLineKeepingComplete(
        current,
        masterLine,
        longest.ref.kind,
      );
      if (
        !shortened ||
        countWords(shortened) >= countWords(current) ||
        isIncompleteBullet(shortened)
      ) {
        unsinkable.add(refKey(longest.ref));
        continue;
      }
      setLineText(fitted, longest.ref, shortened);
    }
  };

  shrinkPass();
  // After budget trims, only fix hanging endings — do not undo safe shortenings.
  healAllLines(fitted, master, { restorePrefixCuts: false });
  shrinkPass();
  healAllLines(fitted, master, { restorePrefixCuts: false });

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
