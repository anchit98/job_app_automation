interface ResumeContentLike {
  experience: Array<{ company: string; bullets: string[] }>;
  projects: Array<{ name: string; bullets: string[] }>;
}

export interface SectionLayoutRule {
  label?: string;
  bullets: number;
  sentences_per_bullet: number;
}

export interface BulletLayoutSpec {
  experience: SectionLayoutRule[];
  projects: SectionLayoutRule[];
}

// Line-fit is governed by RENDERED WIDTH (see text-width.ts), not character count.
// Calibrated against the master Google Doc:
//   - WPP b2 (known 2-line) = width ~199
//   - Servetel b0 (known 3-line) = width ~246
// => per-line capacity is ~100-122 width units. To GUARANTEE 2 lines (never 3) for any
//    glyph mix, the 2-line ceiling must stay at/below the worst-case (~199). We cap at 196.
export const BULLET_MAX_WIDTH = 196; // hard ceiling - above this risks a 3rd line
export const BULLET_TARGET_WIDTH = 178; // sweet spot (matches master WPP b0 at ~183)

// Word-count guidance for the LLM prompt (a bullet at target width is ~28-30 words).
export const TWO_LINE_MIN_WORDS = 26;
export const TWO_LINE_MAX_WORDS = 32;
export const TWO_LINE_TARGET_WORDS = 29;

export const BULLET_LAYOUT_VERSION = 5;

/** Whitespace-delimited token count - matches each bullet line in the master Google Doc. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wordTargetForMasterBullet(masterBullet: string): number {
  return countWords(masterBullet);
}

export function wordTargetsForMasterBullets(masterBullets: string[]): number[] {
  return masterBullets.map(wordTargetForMasterBullet);
}

export const ANCHIT_BULLET_LAYOUT: BulletLayoutSpec = {
  experience: [
    { label: "WPP Media", bullets: 4, sentences_per_bullet: 2 },
    { label: "Annalect India (Omnicom Group)", bullets: 4, sentences_per_bullet: 2 },
    { label: "Servetel Communications", bullets: 2, sentences_per_bullet: 2 },
  ],
  projects: [
    { label: "Groww Review Analyzer AI Agent", bullets: 1, sentences_per_bullet: 2 },
    { label: "RAG Chatbot", bullets: 1, sentences_per_bullet: 2 },
    { label: "Meta Campaign Activation (at WPP Media)", bullets: 1, sentences_per_bullet: 2 },
  ],
};

/** Split on sentence boundaries (. ! ?) - same logic as countSentences. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/** Count sentences using terminal punctuation (. ! ?). Bullets without any count as 1. */
export function countSentences(text: string): number {
  const parts = splitSentences(text);
  if (parts.length === 0) return 0;
  return parts.length;
}

const CLAUSE_BREAK =
  /,\s+(?=(?:delivering|reducing|achieving|improving|enabling|owning|managing|leading|introducing|recommended|building|built|implementing|implemented|generating|generated|achieved|monitoring|revamped|analyzed|migrated|while)\b)/i;

function capitalizeSentenceStart(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinTwoSentences(first: string, second: string): string {
  return `${ensureTerminalPunctuation(first)} ${ensureTerminalPunctuation(capitalizeSentenceStart(second))}`;
}

function splitAtNearestComma(text: string, targetWordIndex: number): string | null {
  const words = text.split(/\s+/);
  if (words.length < 8) return null;

  let wordIdx = 0;
  let bestCommaPos = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === " " && text[i - 1] !== ",") {
      wordIdx++;
    }
    if (text[i] === "," && wordIdx >= 4 && wordIdx <= words.length - 4) {
      const dist = Math.abs(wordIdx - targetWordIndex);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestCommaPos = i;
      }
    }
  }

  if (bestCommaPos < 0) return null;

  const first = text.slice(0, bestCommaPos).trim();
  const second = text.slice(bestCommaPos + 1).trim();
  if (!first || !second) return null;

  const joined = joinTwoSentences(first, second);
  return countSentences(joined) === 2 ? joined : null;
}

function splitAtClauseBreak(text: string): string | null {
  const match = text.match(CLAUSE_BREAK);
  if (!match?.index || match.index < 20) return null;

  const first = text.slice(0, match.index).trim();
  const second = text.slice(match.index + match[0].length).trim();
  if (!first || !second) return null;

  const joined = joinTwoSentences(first, second);
  return countSentences(joined) === 2 ? joined : null;
}

/**
 * When the LLM returns one comma-heavy sentence but the layout expects two,
 * split at a master-aligned comma or common clause boundary.
 */
export function trySplitToSentenceCount(
  text: string,
  expected: number,
  masterBullet?: string,
): string {
  const trimmed = text.trim();
  if (!trimmed || expected <= 1) return trimmed;
  if (countSentences(trimmed) === expected) return trimmed;
  if (countSentences(trimmed) !== 1 || expected !== 2) return trimmed;

  if (masterBullet) {
    const masterParts = splitSentences(masterBullet);
    if (masterParts.length === 2) {
      const masterWords = masterBullet.split(/\s+/).length;
      const masterFirstWords = masterParts[0].split(/\s+/).length;
      const ratio = masterFirstWords / Math.max(masterWords, 1);
      const targetWordIdx = Math.round(ratio * trimmed.split(/\s+/).length);
      const aligned = splitAtNearestComma(trimmed, targetWordIdx);
      if (aligned) return aligned;
    }
  }

  return splitAtClauseBreak(trimmed) ?? trimmed;
}

export function getDefaultMasterResumeRules(): Record<string, unknown> {
  return {
    never_fabricate: true,
    bullet_layout_locked: true,
    bullet_layout_version: BULLET_LAYOUT_VERSION,
    bullet_layout: ANCHIT_BULLET_LAYOUT,
  };
}

export function isBulletLayoutLocked(rules?: Record<string, unknown> | null): boolean {
  return rules?.bullet_layout_locked !== false;
}

function parseLayoutRules(
  rules?: Record<string, unknown> | null,
): BulletLayoutSpec | null {
  const raw = rules?.bullet_layout;
  if (!raw || typeof raw !== "object") return null;

  const layout = raw as {
    experience?: SectionLayoutRule[];
    projects?: SectionLayoutRule[];
  };
  if (!layout.experience?.length || !layout.projects?.length) {
    return null;
  }

  return {
    experience: layout.experience,
    projects: layout.projects,
  };
}

function withDefaults(
  rule: Partial<SectionLayoutRule> & { bullets: number; sentences_per_bullet: number },
  fallbackLabel: string,
): SectionLayoutRule {
  return {
    label: rule.label ?? fallbackLabel,
    bullets: rule.bullets,
    sentences_per_bullet: rule.sentences_per_bullet,
  };
}

export function resolveBulletLayout(
  content: ResumeContentLike,
  rules?: Record<string, unknown> | null,
): BulletLayoutSpec {
  const locked = isBulletLayoutLocked(rules);
  const baseLayout = locked
    ? ANCHIT_BULLET_LAYOUT
    : (parseLayoutRules(rules) ?? ANCHIT_BULLET_LAYOUT);

  return {
    experience: baseLayout.experience.map((rule, index) =>
      withDefaults(
        rule,
        content.experience[index]?.company ?? rule.label ?? `Experience ${index}`,
      ),
    ),
    projects: baseLayout.projects.map((rule, index) =>
      withDefaults(
        rule,
        content.projects[index]?.name ?? rule.label ?? `Project ${index}`,
      ),
    ),
  };
}

export function sentenceTargetsForSection(rule: SectionLayoutRule): number[] {
  return Array.from({ length: rule.bullets }, () => rule.sentences_per_bullet);
}

/** Sentence count target per slot - follows the master bullet's actual shape. */
export function sentenceTargetForMasterBullet(
  masterBullet: string,
  sectionRule?: SectionLayoutRule,
): number {
  const fromMaster = countSentences(masterBullet);
  if (fromMaster > 0) return fromMaster;
  return sectionRule?.sentences_per_bullet ?? 1;
}

export function sentenceTargetsForMasterBullets(
  masterBullets: string[],
  sectionRule?: SectionLayoutRule,
): number[] {
  return masterBullets.map((bullet) =>
    sentenceTargetForMasterBullet(bullet, sectionRule),
  );
}

const INCOMPLETE_BULLET_ENDING =
  /\b(and|or|while|by|to|the|a|an|for|with|in|across|through|via|&|,)$/i;

function normalizeBulletWord(word: string): string {
  return word.toLowerCase().replace(/[^\w%+₹$]/g, "");
}

/**
 * When ChatGPT hits output limits, later bullets often end mid-phrase.
 * Complete from the master bullet tail when we can anchor on shared words.
 */
export function healTruncatedBullet(generated: string, master: string): string {
  let text = generated.trim();
  const masterText = master.trim();
  if (!text || !masterText) return text;
  if (!isIncompleteBullet(text)) return text;

  const genWords = text.split(/\s+/).filter(Boolean);
  const masterWords = masterText.split(/\s+/).filter(Boolean);

  if (genWords.length < masterWords.length) {
    const sliceHealed = [...genWords, ...masterWords.slice(genWords.length)].join(
      " ",
    );
    let candidate = sliceHealed.trim();
    if (!/[.!?]$/.test(candidate)) candidate = `${candidate}.`;
    if (!isIncompleteBullet(candidate)) return candidate;
  }

  const lastGenWord = normalizeBulletWord(genWords[genWords.length - 1] ?? "");
  if (lastGenWord) {
    for (let i = masterWords.length - 1; i >= 0; i--) {
      if (normalizeBulletWord(masterWords[i] ?? "") !== lastGenWord) continue;
      const tail = masterWords.slice(i + 1);
      if (tail.length === 0) continue;
      let candidate = [...genWords, ...tail].join(" ").trim();
      if (!/[.!?]$/.test(candidate)) candidate = `${candidate}.`;
      if (!isIncompleteBullet(candidate)) return candidate;
    }
  }

  if (genWords.length < masterWords.length * 0.65) {
    return masterText;
  }

  if (!/[.!?]$/.test(text) && !INCOMPLETE_BULLET_ENDING.test(text)) {
    text = `${text}.`;
    if (!isIncompleteBullet(text)) return text;
  }

  return masterText;
}

/** Detect bullets cut off mid-phrase (common when ChatGPT truncates JSON). */
export function isIncompleteBullet(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!/[.!?]$/.test(trimmed)) return true;
  if (INCOMPLETE_BULLET_ENDING.test(trimmed)) return true;
  return false;
}

export function formatBulletLayoutRules(layout: BulletLayoutSpec): string {
  const lines = [
    "LOCKED OUTPUT BULLET STRUCTURE (do not change bullet counts):",
    `Layout version: ${BULLET_LAYOUT_VERSION}`,
    "",
    "Each bullet = ONE JSON string with EXACTLY the word count shown for that slot (from master Google Doc).",
    "One or two sentences inside the string is fine - only total word count must match.",
    "Complete every bullet - never truncate mid-phrase.",
  ];
  for (const rule of layout.experience) {
    lines.push(`- ${rule.label}: exactly ${rule.bullets} bullet(s)`);
  }
  for (const rule of layout.projects) {
    lines.push(`- ${rule.label}: exactly ${rule.bullets} bullet(s)`);
  }
  return lines.join("\n");
}
