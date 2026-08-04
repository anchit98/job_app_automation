import { DocsClient, DocLayoutMap, DocSlot } from "@/lib/google/docs";
import { countWords } from "@/lib/resume/bullet-layout";
import type { ResumeWordBudget } from "@/lib/resume/word-budget";
import {
  heuristicSyncLooksWeak,
  smartSyncMasterResumeFromParagraphs,
} from "@/lib/resume/smart-master-sync";
import {
  assertResumeSyncAtsReady,
  mapResumeSyncFailureToAts,
} from "@/lib/resume/ats-sync";
import { throwAts } from "@/lib/ats/readiness-error";
import { docs_v1 } from "googleapis";

/** Accept common / adjacent section titles — not only our internal template. */
const SECTION_MARKERS = {
  work: /^(WORK(\s+EXPERIENCE)?|EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|EMPLOYMENT(\s+HISTORY)?|CAREER(\s+HISTORY)?|PROFESSIONAL\s+BACKGROUND|RELEVANT\s+EXPERIENCE)\s*:?\s*$/i,
  projects:
    /^(PROJECTS|KEY\s+PROJECTS|SELECTED\s+PROJECTS|PERSONAL\s+PROJECTS|SIDE\s+PROJECTS|TECHNICAL\s+PROJECTS|NOTABLE\s+PROJECTS)\s*:?\s*$/i,
  caseStudies:
    /^(CASE\s+STUDIES|CASE\s+STUDY|SELECTED\s+CASE\s+STUDIES|PRODUCT\s+CASE\s+STUDIES|PORTFOLIO(\s+CASE\s+STUDIES)?)\s*:?\s*$/i,
  skills:
    /^(SKILLS|TECHNICAL\s+SKILLS|CORE\s+SKILLS|SKILLS\s*&\s*TOOLS|TECHNOLOGIES|TECH\s+STACK|TOOLS(\s*&\s*TECHNOLOGIES)?|COMPETENCIES)\s*:?\s*$/i,
  education: /^(EDUCATION|ACADEMIC|ACADEMICS|QUALIFICATIONS)\s*:?\s*$/i,
};

const RULE_RE = /^-{10,}$|^=+$|^_{10,}$|^\|+$/;
const CONTACT_LABEL_RE = /(Email|LinkedIn|GitHub|Portfolio|Phone|Mobile):/i;

interface ParagraphInfo {
  index: number;
  text: string;
  isBullet: boolean;
  paragraph: docs_v1.Schema$Paragraph;
}

function paragraphIsBullet(p: docs_v1.Schema$Paragraph): boolean {
  return Boolean(p.bullet);
}

function extractParagraphs(doc: docs_v1.Schema$Document): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  let i = 0;
  for (const el of doc.body?.content ?? []) {
    if (!el.paragraph) continue;
    let text = "";
    for (const child of el.paragraph.elements ?? []) {
      if (child.textRun?.content) text += child.textRun.content;
    }
    paragraphs.push({
      index: i++,
      text: text.replace(/\n$/, "").trim(),
      isBullet: paragraphIsBullet(el.paragraph),
      paragraph: el.paragraph,
    });
  }
  return paragraphs;
}

export interface SyncedMasterResume {
  content: {
    headline: string;
    contact_line: string;
    links_line: string;
    experience: Array<{
      company: string;
      title: string;
      location?: string;
      start_date?: string;
      end_date?: string;
      bullets: string[];
    }>;
    projects: Array<{
      name: string;
      subtitle?: string;
      website_url?: string;
      bullets: string[];
    }>;
    skills: string[];
    education: Array<{ institution_line: string; dates: string }>;
  };
  layout: DocLayoutMap;
  sync_mode?: "heuristic" | "smart_agent";
}

/**
 * Parse an experience/education "role row" like
 *   "WPP Media, Senior Business Analyst (Product Operations) | Bengaluru, India                Mar 2024 - Present"
 * into structured pieces.
 */
function parseRoleLine(line: string): {
  company: string;
  title: string;
  location?: string;
  start_date?: string;
  end_date?: string;
} {
  // Docs often pads company/title and dates with many spaces/tabs
  const collapsed = line.replace(/\s{2,}/g, "\t").trim();
  const parts = collapsed.split("\t").map((s) => s.trim()).filter(Boolean);
  const left = parts[0] ?? "";
  const dates = parts.length > 1 ? parts[parts.length - 1] : "";

  const dateMatch = dates.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  const start_date = dateMatch?.[1]?.trim();
  const end_date = dateMatch?.[2]?.trim();

  const [companyTitle, location] = left.split(/\s*\|\s*/);
  const [company, ...titleRest] = (companyTitle ?? "").split(/,\s*/);
  const title = titleRest.join(", ").trim();

  return {
    company: company?.trim() ?? "",
    title,
    location: location?.trim(),
    start_date,
    end_date,
  };
}

/** Collapse Docs padding spaces/tabs so length checks stay meaningful. */
function compactWhitespace(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function looksLikeRoleHeader(line: string): boolean {
  const compact = compactWhitespace(line);
  if (compact.length > 140 || compact.length === 0) return false;
  if (/^[•\-\u2022*]/.test(compact)) return false;
  // Company, Title | Location   OR   Title at Company
  if (
    /,/.test(compact) &&
    (/\|/.test(compact) || /\b(19|20)\d{2}\b|Present|Current/i.test(compact))
  ) {
    return true;
  }
  if (/\bat\b/i.test(compact) && /\b(19|20)\d{2}\b|Present|Current/i.test(compact)) {
    return true;
  }
  return false;
}

function looksLikeBulletBody(line: string): boolean {
  const compact = compactWhitespace(line);
  if (!compact || RULE_RE.test(compact)) return false;
  if (/^[•\-\u2022*]/.test(compact)) return true;
  if (compact.length >= 45) return true;
  // Short achievement-ish lines
  return /^(Led|Built|Designed|Developed|Created|Implemented|Automated|Improved|Reduced|Increased|Managed|Owned|Delivered|Partnered|Migrated|Engineered|Collaborated)\b/i.test(
    compact,
  );
}

/** Project/case-study title lines like "Name | Tech, Stack" — not achievement prose. */
function looksLikeProjectTitle(line: string): boolean {
  const compact = compactWhitespace(line);
  if (!compact || /^[•\-\u2022*]/.test(compact)) return false;
  if (!compact.includes("|")) return false;
  const left = compact.split("|")[0]?.trim() ?? "";
  if (!left || left.length > 80) return false;
  // Achievement prose usually ends the left side with punctuation or is a full sentence
  if (/[.!?]$/.test(left)) return false;
  return true;
}

function parseProjectTitleLine(line: string): {
  name: string;
  subtitle?: string;
} {
  const compact = compactWhitespace(line);
  const [name, ...rest] = compact.split(/\s*\|\s*/);
  return {
    name: name?.trim() ?? "",
    subtitle: rest.length ? rest.join(" | ").trim() : undefined,
  };
}

function extractProjectWebsite(
  paragraph: docs_v1.Schema$Paragraph,
): string | undefined {
  for (const el of paragraph.elements ?? []) {
    const url = el.textRun?.textStyle?.link?.url;
    if (url) return url;
  }
  return undefined;
}

function findSection(paragraphs: ParagraphInfo[], regex: RegExp): number {
  return paragraphs.findIndex((p) => regex.test(p.text));
}

function stripBulletPrefix(text: string): string {
  return text.replace(/^[•\-\u2022*]\s+/, "").trim();
}

function buildSlotsUniquely(slots: DocSlot[]): DocSlot[] {
  const seen = new Set<string>();
  const out: DocSlot[] = [];
  for (const s of slots) {
    if (!s.original.trim() || seen.has(s.original)) continue;
    seen.add(s.original);
    out.push(s);
  }
  return out;
}

function heuristicSyncFromParagraphs(
  docId: string,
  paragraphs: ParagraphInfo[],
): SyncedMasterResume | null {
  const workIdx = findSection(paragraphs, SECTION_MARKERS.work);
  const projectsIdx = findSection(paragraphs, SECTION_MARKERS.projects);
  const caseStudiesIdx = findSection(paragraphs, SECTION_MARKERS.caseStudies);
  const skillsIdx = findSection(paragraphs, SECTION_MARKERS.skills);
  const eduIdx = findSection(paragraphs, SECTION_MARKERS.education);

  // Without clear experience + skills markers, defer to smart agent
  // (agent can still recover odd layouts).
  if (workIdx < 0) {
    return null;
  }

  const header = paragraphs
    .slice(0, workIdx)
    .filter((p) => p.text.length > 0 && !RULE_RE.test(p.text));

  const headline =
    header.find((p, i) => i > 0 && p.text.length > 12 && !CONTACT_LABEL_RE.test(p.text))
      ?.text ??
    header.find((p) => p.text.length > 20 && !CONTACT_LABEL_RE.test(p.text))?.text ??
    "";
  const contactLine =
    header.find(
      (p) =>
        CONTACT_LABEL_RE.test(p.text) &&
        /email|phone|mobile/i.test(p.text),
    )?.text ?? "";
  const linksLine =
    header.find(
      (p) =>
        /linkedin/i.test(p.text) ||
        /github/i.test(p.text) ||
        /portfolio/i.test(p.text),
    )?.text ?? "";

  const slots: DocSlot[] = [];
  if (headline) {
    slots.push({ key: "headline", original: headline, section: "headline" });
  }

  const sectionStarts = [projectsIdx, caseStudiesIdx, skillsIdx, eduIdx]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const workEnd = sectionStarts[0] ?? paragraphs.length;
  const workSection = paragraphs.slice(workIdx + 1, workEnd);
  const experience: SyncedMasterResume["content"]["experience"] = [];
  let currentRole: (typeof experience)[number] | null = null;
  let expIndex = -1;

  for (const p of workSection) {
    if (
      !p.text ||
      RULE_RE.test(p.text) ||
      SECTION_MARKERS.projects.test(p.text) ||
      SECTION_MARKERS.caseStudies.test(p.text)
    ) {
      continue;
    }
    const isBullet =
      p.isBullet || (!looksLikeRoleHeader(p.text) && looksLikeBulletBody(p.text));
    if (isBullet && currentRole) {
      const bulletText = stripBulletPrefix(p.text);
      if (!bulletText) continue;
      const bulletIdx = currentRole.bullets.length;
      currentRole.bullets.push(bulletText);
      slots.push({
        key: `exp_${expIndex}_bullet_${bulletIdx}`,
        original: p.text,
        section: "experience",
        experience_index: expIndex,
        bullet_index: bulletIdx,
        word_count: countWords(p.text),
      });
      continue;
    }

    if (looksLikeRoleHeader(p.text) || !p.isBullet) {
      const parsed = parseRoleLine(p.text);
      if (
        !parsed.company ||
        parsed.company === "-" ||
        (!parsed.title && !parsed.start_date)
      ) {
        if (currentRole && looksLikeBulletBody(p.text)) {
          const bulletText = stripBulletPrefix(p.text);
          const bulletIdx = currentRole.bullets.length;
          currentRole.bullets.push(bulletText);
          slots.push({
            key: `exp_${expIndex}_bullet_${bulletIdx}`,
            original: p.text,
            section: "experience",
            experience_index: expIndex,
            bullet_index: bulletIdx,
            word_count: countWords(p.text),
          });
        }
        continue;
      }
      currentRole = {
        company: parsed.company,
        title: parsed.title || parsed.company,
        location: parsed.location,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        bullets: [],
      };
      experience.push(currentRole);
      expIndex++;
    }
  }

  /** Projects + Case Studies share the same structured/project slot model. */
  const projects: SyncedMasterResume["content"]["projects"] = [];
  let projIndex = -1;

  function parseProjectLikeBlock(startIdx: number, endIdx: number) {
    if (startIdx < 0) return;
    let currentProject: (typeof projects)[number] | null = null;
    for (const p of paragraphs.slice(startIdx + 1, endIdx)) {
      if (
        !p.text ||
        RULE_RE.test(p.text) ||
        SECTION_MARKERS.projects.test(p.text) ||
        SECTION_MARKERS.caseStudies.test(p.text) ||
        SECTION_MARKERS.skills.test(p.text) ||
        SECTION_MARKERS.education.test(p.text)
      ) {
        continue;
      }
      // Title lines (Name | stack) must win over the "long line = bullet" heuristic
      if (looksLikeProjectTitle(p.text)) {
        const parsed = parseProjectTitleLine(p.text);
        if (!parsed.name) continue;
        currentProject = {
          ...parsed,
          website_url: extractProjectWebsite(p.paragraph),
          bullets: [],
        };
        projects.push(currentProject);
        projIndex++;
        continue;
      }

      const isBullet =
        p.isBullet || (!!currentProject && looksLikeBulletBody(p.text));
      if (isBullet && currentProject) {
        const bulletIdx = currentProject.bullets.length;
        currentProject.bullets.push(stripBulletPrefix(p.text));
        slots.push({
          key: `proj_${projIndex}_bullet_${bulletIdx}`,
          original: p.text,
          section: "project",
          project_index: projIndex,
          bullet_index: bulletIdx,
          word_count: countWords(p.text),
        });
      } else if (!p.isBullet) {
        const parsed = parseProjectTitleLine(p.text);
        if (!parsed.name) continue;
        currentProject = {
          ...parsed,
          website_url: extractProjectWebsite(p.paragraph),
          bullets: [],
        };
        projects.push(currentProject);
        projIndex++;
      }
    }
  }

  // Parse in document order so indices stay stable
  const projectLikeSections = [
    { idx: projectsIdx, kind: "projects" as const },
    { idx: caseStudiesIdx, kind: "caseStudies" as const },
  ]
    .filter((s) => s.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  for (let i = 0; i < projectLikeSections.length; i++) {
    const start = projectLikeSections[i].idx;
    const nextSection = projectLikeSections[i + 1]?.idx;
    const endCandidates = [nextSection, skillsIdx, eduIdx, paragraphs.length].filter(
      (n): n is number => typeof n === "number" && n >= 0,
    );
    const end = Math.min(...endCandidates);
    parseProjectLikeBlock(start, end);
  }

  const skills: string[] = [];
  if (skillsIdx >= 0) {
    const skillSection = paragraphs.slice(
      skillsIdx + 1,
      eduIdx >= 0 ? eduIdx : paragraphs.length,
    );
    let skillIndex = 0;
    for (const p of skillSection) {
      if (!p.text || RULE_RE.test(p.text)) continue;
      if (p.isBullet || p.text.includes(":") || p.text.length > 8) {
        skills.push(p.text);
        slots.push({
          key: `skill_${skillIndex}`,
          original: p.text,
          section: "skill",
          skill_index: skillIndex,
        });
        skillIndex++;
      }
    }
  }

  const education: SyncedMasterResume["content"]["education"] = [];
  if (eduIdx >= 0) {
    const eduSection = paragraphs.slice(eduIdx + 1);
    for (const p of eduSection) {
      if (!p.text || RULE_RE.test(p.text)) continue;
      const collapsed = p.text.replace(/\s{2,}/g, "\t").trim();
      const parts = collapsed.split("\t").map((s) => s.trim());
      const dates = parts.length > 1 ? parts[parts.length - 1] : "";
      const institution = parts
        .slice(0, parts.length > 1 ? -1 : undefined)
        .join(" ")
        .trim();
      if (!institution) continue;
      education.push({ institution_line: institution, dates });
    }
  }

  let fixedLineWords = 0;
  let tailorableWords = 0;
  const budgetEnd = eduIdx >= 0 ? eduIdx : paragraphs.length;
  for (let i = workIdx + 1; i < budgetEnd; i++) {
    const p = paragraphs[i];
    if (!p?.text) continue;
    if (p.isBullet || looksLikeBulletBody(p.text)) {
      tailorableWords += countWords(p.text);
    } else if (
      !SECTION_MARKERS.projects.test(p.text) &&
      !SECTION_MARKERS.caseStudies.test(p.text) &&
      !SECTION_MARKERS.skills.test(p.text)
    ) {
      fixedLineWords += countWords(p.text);
    }
  }
  const wordBudget: ResumeWordBudget = {
    work_through_skills_total: fixedLineWords + tailorableWords,
    fixed_line_words: fixedLineWords,
    tailorable_words: tailorableWords,
  };

  const uniqueSlots = buildSlotsUniquely(slots);
  const layout: DocLayoutMap = {
    master_doc_id: docId,
    version: 1,
    mapped_at: new Date().toISOString(),
    slots: uniqueSlots,
    word_budget: wordBudget,
  };

  return {
    content: {
      headline,
      contact_line: contactLine,
      links_line: linksLine,
      experience,
      projects,
      skills,
      education,
    },
    layout,
    sync_mode: "heuristic",
  };
}

/**
 * Sync master resume from any Google Doc layout.
 * 1) Fast heuristic parse for common sectioned resumes
 * 2) If weak/missing structure → template agent (OpenAI) maps THEIR format
 *    while keeping replaceable slots so PDF output stays in their Doc look.
 */
export async function syncMasterResumeFromDoc(
  client: DocsClient,
  docId: string,
): Promise<SyncedMasterResume> {
  const doc = await client.getDocument(docId);
  const paragraphs = extractParagraphs(doc);
  const nonEmptyCount = paragraphs.filter((p) => p.text.trim()).length;

  if (nonEmptyCount === 0) {
    throwAts(
      "Use selectable Google Docs text (not a scanned image or empty Doc).",
    );
  }

  const heuristic = heuristicSyncFromParagraphs(docId, paragraphs);
  let synced: SyncedMasterResume | null = null;

  if (heuristic && !heuristicSyncLooksWeak(heuristic)) {
    synced = heuristic;
  } else {
    try {
      const smart = await smartSyncMasterResumeFromParagraphs(
        docId,
        paragraphs.map((p) => ({
          index: p.index,
          text: p.text,
          isBullet: p.isBullet,
        })),
      );
      synced = { ...smart, sync_mode: "smart_agent" };
    } catch (smartErr) {
      if (
        heuristic &&
        heuristic.content.experience.some((e) => e.bullets.length > 0)
      ) {
        synced = heuristic;
      } else {
        const msg =
          smartErr instanceof Error ? smartErr.message : "Smart resume sync failed.";
        if (msg.startsWith("ATS readiness")) throw smartErr;
        mapResumeSyncFailureToAts(msg);
      }
    }
  }

  if (!synced) {
    throwAts(
      "Add Work Experience with each achievement as its own bullet line.",
    );
  }

  assertResumeSyncAtsReady(synced, nonEmptyCount);
  return synced;
}
