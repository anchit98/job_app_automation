import type { ResumeContent } from "@/lib/resume/fabrication";
import {
  countWords,
  ensureCompleteBullet,
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

/** Split a skill list on commas (items after an optional Category: prefix). */
function splitSkillItems(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Case-insensitive de-dupe; keeps first spelling/order. */
export function dedupeSkillItems(list: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of splitSkillItems(list)) {
    const key = item.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.join(", ");
}

/**
 * Master skills are either:
 * - Category lines: "Category: a, b, c"
 * - Flat lists: "a, b, c" (no colon)
 * Never invent a Category: prefix from a flat master line (that duplicates the whole list).
 */
export function enforceSkillPrefix(masterLine: string, genLine: string): string {
  const master = masterLine.trim().replace(/[.\s]+$/g, "");
  const generated = (genLine || master).trim().replace(/[.\s]+$/g, "");
  if (!master) return dedupeSkillItems(generated);

  const masterColon = master.indexOf(":");
  if (masterColon < 0) {
    // Flat master — keep a flat tailored list; strip a mistaken "prefix:" the model added.
    const genColon = generated.indexOf(":");
    if (genColon >= 0) {
      const left = generated.slice(0, genColon).trim();
      const right = generated.slice(genColon + 1).trim();
      // Model echoed the whole master (or similar) as a fake category
      if (
        left.toLowerCase() === master.toLowerCase() ||
        master.toLowerCase().startsWith(left.toLowerCase()) ||
        left.toLowerCase().startsWith(master.toLowerCase().slice(0, 24))
      ) {
        return dedupeSkillItems(right || master);
      }
    }
    return dedupeSkillItems(generated || master);
  }

  const masterPrefix = master.slice(0, masterColon).trim();
  if (!masterPrefix) return dedupeSkillItems(generated || master);

  const genColon = generated.indexOf(":");
  let tail =
    genColon >= 0
      ? generated.slice(genColon + 1).trim()
      : generated.trim();

  // Drop echoed category tokens from the start of the item list
  const prefixItems = splitSkillItems(masterPrefix);
  if (prefixItems.length > 0) {
    const tailItems = splitSkillItems(tail);
    while (
      tailItems.length > 0 &&
      prefixItems.some(
        (p) => p.toLowerCase() === tailItems[0].toLowerCase(),
      )
    ) {
      // Only strip when the entire prefix was pasted into the tail start
      const head = tailItems
        .slice(0, prefixItems.length)
        .map((s) => s.toLowerCase())
        .join("|");
      const pref = prefixItems.map((s) => s.toLowerCase()).join("|");
      if (head === pref) {
        tailItems.splice(0, prefixItems.length);
        tail = tailItems.join(", ");
      }
      break;
    }
  }

  tail = dedupeSkillItems(tail);
  return tail ? `${masterPrefix}: ${tail}` : `${masterPrefix}:`;
}

/**
 * Normalize every skill line against the master shape (prefix + de-dupe).
 */
export function normalizeResumeSkills(
  generated: string[],
  master: string[],
): string[] {
  if (master.length === 0) {
    return generated.map((line) => dedupeSkillItems(line.trim())).filter(Boolean);
  }
  return master.map((masterLine, i) =>
    enforceSkillPrefix(masterLine, generated[i] ?? masterLine),
  );
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
    } else {
      const items = splitSkillItems(current);
      if (items.length > 1) {
        items.pop();
        const next = items.join(", ");
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
    const candidate = ensureTerminalPunctuation(
      current.slice(0, lastComma).trim(),
    );
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
    // Skills are list lines, not narrative sentences — skip sentence heal.
    if (ref.kind === "skill") continue;
    const masterLine = getMasterLineText(master, ref);
    const current = getLineText(content, ref);
    if (!masterLine) continue;
    let healed = healTruncatedBullet(current, masterLine, options);
    if (isIncompleteBullet(healed)) {
      healed = ensureCompleteBullet(current, masterLine);
    }
    setLineText(content, ref, healed);
  }
}

/** Final pass: every experience/project bullet must read as a finished sentence. */
function ensureAllBulletsComplete(
  content: ResumeContent,
  master: ResumeContent,
): void {
  for (const ref of collectLineRefs(content)) {
    if (ref.kind === "skill") continue;
    const masterLine = getMasterLineText(master, ref);
    const current = getLineText(content, ref);
    if (!current && !masterLine) continue;
    setLineText(
      content,
      ref,
      ensureCompleteBullet(current, masterLine || current),
    );
  }
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
  ensureAllBulletsComplete(fitted, master);

  fitted.skills = normalizeResumeSkills(fitted.skills, master.skills);

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
