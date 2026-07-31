import { z } from "zod";
import { buildResumeStructuralGuide } from "@/lib/resume/prompt-anchors";
import { isIncompleteBullet } from "@/lib/resume/bullet-layout";
import {
  countTailorableWords,
  parseResumeWordBudget,
} from "@/lib/resume/word-budget";

export { countSentences } from "@/lib/resume/bullet-layout";

export const resumeExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  bullets: z.array(z.string().min(1)).min(1),
});

export const resumeProjectSchema = z.object({
  name: z.string().min(1),
  subtitle: z.string().optional(),
  website_url: z.string().optional(),
  bullets: z.array(z.string().min(1)).min(1),
});

export const resumeEducationSchema = z.object({
  institution_line: z.string().min(1),
  dates: z.string().min(1),
});

export const resumeContentSchema = z.object({
  headline: z.string().optional(),
  contact_line: z.string().optional(),
  links_line: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(resumeExperienceSchema).min(1),
  projects: z.array(resumeProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  education: z.array(resumeEducationSchema).default([]),
});

export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;
export type ResumeProject = z.infer<typeof resumeProjectSchema>;
export type ResumeEducation = z.infer<typeof resumeEducationSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;

export type FabricationFlagReason =
  | "no_match"
  | "new_metric"
  | "structural_drift"
  | "missing_jd_keyword";

export interface FabricationFlag {
  id: string;
  path: string;
  bullet: string;
  reason: FabricationFlagReason;
  message: string;
  suggested_source?: string;
}

export interface FabricationResult {
  structural_errors: FabricationFlag[];
  fabrication_flags: FabricationFlag[];
}

const METRIC_REGEX =
  /\d+(?:\.\d+)?%?|\$\d[\d,]*(?:\.\d+)?[kmb]?|(?:~?\s*)?INR\s*[\d,.]+(?:\s*Cr\+?)?/gi;

function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractMetrics(text: string): string[] {
  return (text.match(METRIC_REGEX) ?? []).map((m) =>
    m.toLowerCase().replace(/\s+/g, " ").trim(),
  );
}

function joinBulletParts(previous: string, next: string): string {
  const left = previous.trim();
  const right = next.trim();
  if (/[.!?]$/.test(left)) {
    return `${left} ${right}`;
  }
  return `${left}. ${right}`;
}

/**
 * The AI sometimes emits extra bullet strings for one slot. Merge overflow
 * into the last expected slot.
 */
export function normalizeBulletsToMasterShape(
  masterBullets: string[],
  tailoredBullets: string[] | undefined,
): string[] {
  const expectedCount = masterBullets.length;

  if (!tailoredBullets || tailoredBullets.length === 0) {
    return masterBullets.slice(0, expectedCount);
  }
  if (tailoredBullets.length <= expectedCount) {
    return tailoredBullets;
  }

  const head = tailoredBullets.slice(0, expectedCount - 1);
  const merged = tailoredBullets
    .slice(expectedCount - 1)
    .reduce(
      (acc, part) => (acc ? joinBulletParts(acc, part) : part.trim()),
      "",
    );
  return [...head, merged];
}

function findBestMasterMatch(
  bullet: string,
  masterBullets: string[],
): { text: string; score: number } | null {
  const normalizedBullet = bullet.toLowerCase();
  for (const source of masterBullets) {
    if (
      normalizedBullet.includes(source.toLowerCase()) ||
      source.toLowerCase().includes(normalizedBullet)
    ) {
      return { text: source, score: 1 };
    }
  }

  const bulletTokens = normalizeTokens(bullet);
  let best: { text: string; score: number } | null = null;
  for (const source of masterBullets) {
    const score = jaccardSimilarity(bulletTokens, normalizeTokens(source));
    if (!best || score > best.score) {
      best = { text: source, score };
    }
  }
  return best;
}

function flagId(path: string, reason: FabricationFlagReason): string {
  return `${path}::${reason}`;
}

function checkBullets(
  bullets: string[],
  masterBulletsAligned: string[],
  basePath: string,
  fabrication_flags: FabricationFlag[],
  structural_errors: FabricationFlag[],
) {
  for (let j = 0; j < bullets.length; j++) {
    const bullet = bullets[j];
    const masterBullet = masterBulletsAligned[j] ?? "";
    const bulletPath = `${basePath}.bullets[${j}]`;

    if (isIncompleteBullet(bullet)) {
      structural_errors.push({
        id: flagId(bulletPath, "structural_drift"),
        path: bulletPath,
        bullet,
        reason: "structural_drift",
        message:
          "Bullet ends mid-sentence. Rewrite as a complete finished sentence at or under the master line length.",
        suggested_source: masterBullet || undefined,
      });
    }

    const match = masterBullet
      ? findBestMasterMatch(bullet, [masterBullet])
      : null;

    if (match) {
      const sourceMetrics = new Set(extractMetrics(match.text));
      const newMetrics = extractMetrics(bullet).filter((m) => !sourceMetrics.has(m));
      if (newMetrics.length > 0) {
        fabrication_flags.push({
          id: flagId(bulletPath, "new_metric"),
          path: bulletPath,
          bullet,
          reason: "new_metric",
          message: `New metrics not in source: ${newMetrics.join(", ")}`,
          suggested_source: match.text,
        });
      }
    }
  }
}

export function checkResumeFabrication(
  master: ResumeContent,
  generated: ResumeContent,
  rules?: Record<string, unknown> | null,
  docLayout?: Record<string, unknown> | null,
): FabricationResult {
  const structural_errors: FabricationFlag[] = [];
  const fabrication_flags: FabricationFlag[] = [];

  for (let i = 0; i < master.education.length; i++) {
    const masterEdu = master.education[i];
    const genEdu = generated.education[i];
    if (!genEdu) continue;
    if (
      masterEdu.institution_line.trim().toLowerCase() !==
      genEdu.institution_line.trim().toLowerCase()
    ) {
      structural_errors.push({
        id: flagId(`education[${i}].institution_line`, "structural_drift"),
        path: `education[${i}].institution_line`,
        bullet: genEdu.institution_line,
        reason: "structural_drift",
        message: "Education institution line must not change.",
      });
    }
    if (masterEdu.dates.trim() !== genEdu.dates.trim()) {
      structural_errors.push({
        id: flagId(`education[${i}].dates`, "structural_drift"),
        path: `education[${i}].dates`,
        bullet: genEdu.dates,
        reason: "structural_drift",
        message: "Education dates must not change.",
      });
    }
  }

  const budget = parseResumeWordBudget(docLayout, master);
  const actualWords = countTailorableWords(generated);
  if (actualWords > budget.tailorable_words) {
    structural_errors.push({
      id: flagId("tailorable", "structural_drift"),
      path: "tailorable",
      bullet: "",
      reason: "structural_drift",
      message: `Word count too high: bullets + skills must be at most ${budget.tailorable_words} words, got ${actualWords}.`,
    });
  }

  for (let i = 0; i < master.experience.length; i++) {
    const masterExp = master.experience[i];
    const genExp = generated.experience[i];
    if (!genExp) continue;
    checkBullets(
      genExp.bullets,
      masterExp.bullets,
      `experience[${i}]`,
      fabrication_flags,
      structural_errors,
    );
  }

  for (let i = 0; i < master.projects.length; i++) {
    const masterProj = master.projects[i];
    const genProj = generated.projects[i];
    if (!genProj) continue;
    checkBullets(
      genProj.bullets,
      masterProj.bullets,
      `projects[${i}]`,
      fabrication_flags,
      structural_errors,
    );
  }

  return { structural_errors, fabrication_flags };
}

export function filterUnresolvedFlags(
  flags: FabricationFlag[],
  acceptedFlagIds: string[],
): FabricationFlag[] {
  const accepted = new Set(acceptedFlagIds);
  return flags.filter((f) => !accepted.has(f.id));
}

export function sectionWordBudgets(
  content: ResumeContent,
  rules?: Record<string, unknown> | null,
): string {
  return buildResumeStructuralGuide(content, rules);
}
