import { docs_v1 } from "googleapis";
import { DocsClient, DocLayoutMap, DocSlot } from "@/lib/google/docs";
import { countWords } from "@/lib/resume/bullet-layout";
import type { ResumeWordBudget } from "@/lib/resume/word-budget";

const SECTION_MARKERS = {
  work: /^WORK EXPERIENCE\s*$/i,
  projects: /^PROJECTS\s*$/i,
  skills: /^SKILLS\s*$/i,
  education: /^EDUCATION\s*$/i,
};

const RULE_RE = /^-{20,}$/;
const CONTACT_LABEL_RE = /(Email|LinkedIn|GitHub|Portfolio):/i;

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
  const collapsed = line.replace(/\s{2,}/g, "\t").trim();
  const parts = collapsed.split("\t").map((s) => s.trim()).filter(Boolean);
  const left = parts[0] ?? "";
  const dates = parts.length > 1 ? parts[parts.length - 1] : "";

  const dateMatch = dates.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  const start_date = dateMatch?.[1];
  const end_date = dateMatch?.[2];

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

function parseProjectTitleLine(line: string): {
  name: string;
  subtitle?: string;
} {
  const [name, ...rest] = line.split(/\s*\|\s*/);
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

export async function syncMasterResumeFromDoc(
  client: DocsClient,
  docId: string,
): Promise<SyncedMasterResume> {
  const doc = await client.getDocument(docId);
  const paragraphs = extractParagraphs(doc);

  const workIdx = findSection(paragraphs, SECTION_MARKERS.work);
  const projectsIdx = findSection(paragraphs, SECTION_MARKERS.projects);
  const skillsIdx = findSection(paragraphs, SECTION_MARKERS.skills);
  const eduIdx = findSection(paragraphs, SECTION_MARKERS.education);

  if (workIdx < 0 || skillsIdx < 0 || eduIdx < 0) {
    throw new Error(
      "Master doc missing required sections (WORK EXPERIENCE, SKILLS, EDUCATION). Ensure section headers exist as uppercase text.",
    );
  }

  // Header block: name (first non-empty), headline (second), contact, links
  const header = paragraphs
    .slice(0, workIdx)
    .filter((p) => p.text.length > 0 && !RULE_RE.test(p.text));

  const headline = header[1]?.text ?? "";
  const contactLine =
    header.find(
      (p) =>
        CONTACT_LABEL_RE.test(p.text) &&
        /email/i.test(p.text) &&
        !p.text.toLowerCase().includes("linkedin"),
    )?.text ?? "";
  const linksLine =
    header.find(
      (p) =>
        /linkedin/i.test(p.text) &&
        /github/i.test(p.text) &&
        /portfolio/i.test(p.text),
    )?.text ?? "";

  const slots: DocSlot[] = [];
  if (headline) {
    slots.push({ key: "headline", original: headline, section: "headline" });
  }

  // Work Experience: pairs of role-line + bullets until next section
  const workSection = paragraphs.slice(workIdx + 1, projectsIdx < 0 ? skillsIdx : projectsIdx);
  const experience: SyncedMasterResume["content"]["experience"] = [];
  let currentRole: (typeof experience)[number] | null = null;
  let expIndex = -1;

  for (const p of workSection) {
    if (!p.text) continue;
    if (p.isBullet) {
      if (!currentRole) continue;
      const bulletIdx = currentRole.bullets.length;
      currentRole.bullets.push(p.text);
      slots.push({
        key: `exp_${expIndex}_bullet_${bulletIdx}`,
        original: p.text,
        section: "experience",
        experience_index: expIndex,
        bullet_index: bulletIdx,
        word_count: countWords(p.text),
      });
    } else {
      const parsed = parseRoleLine(p.text);
      currentRole = { ...parsed, bullets: [] };
      experience.push(currentRole);
      expIndex++;
    }
  }

  // Projects
  const projects: SyncedMasterResume["content"]["projects"] = [];
  if (projectsIdx >= 0) {
    const projectSection = paragraphs.slice(projectsIdx + 1, skillsIdx);
    let currentProject: (typeof projects)[number] | null = null;
    let projIndex = -1;

    for (const p of projectSection) {
      if (!p.text) continue;
      if (p.isBullet) {
        if (!currentProject) continue;
        const bulletIdx = currentProject.bullets.length;
        currentProject.bullets.push(p.text);
        slots.push({
          key: `proj_${projIndex}_bullet_${bulletIdx}`,
          original: p.text,
          section: "project",
          project_index: projIndex,
          bullet_index: bulletIdx,
          word_count: countWords(p.text),
        });
      } else {
        const parsed = parseProjectTitleLine(p.text);
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

  // Skills
  const skillSection = paragraphs.slice(skillsIdx + 1, eduIdx);
  const skills: string[] = [];
  let skillIndex = 0;
  for (const p of skillSection) {
    if (!p.text || !p.isBullet) continue;
    skills.push(p.text);
    slots.push({
      key: `skill_${skillIndex}`,
      original: p.text,
      section: "skill",
      skill_index: skillIndex,
    });
    skillIndex++;
  }

  // Education
  const eduSection = paragraphs.slice(eduIdx + 1);
  const education: SyncedMasterResume["content"]["education"] = [];
  for (const p of eduSection) {
    if (!p.text) continue;
    const collapsed = p.text.replace(/\s{2,}/g, "\t").trim();
    const parts = collapsed.split("\t").map((s) => s.trim());
    const dates = parts.length > 1 ? parts[parts.length - 1] : "";
    const institution = parts.slice(0, parts.length > 1 ? -1 : undefined).join(" ").trim();
    education.push({ institution_line: institution, dates });
  }

  // Validate slot uniqueness
  const seen = new Set<string>();
  for (const s of slots) {
    if (seen.has(s.original)) {
      throw new Error(
        `Duplicate text detected in master doc - cannot uniquely identify slot "${s.key}". Make each bullet/skill line unique before syncing.`,
      );
    }
    seen.add(s.original);
  }

  // Word budget: WORK EXPERIENCE body → end of SKILLS (keeps one-page layout)
  let fixedLineWords = 0;
  let tailorableWords = 0;
  const budgetEnd = eduIdx;
  for (let i = workIdx + 1; i < budgetEnd; i++) {
    const p = paragraphs[i];
    if (!p.text) continue;
    if (p.isBullet) {
      tailorableWords += countWords(p.text);
    } else if (
      !SECTION_MARKERS.projects.test(p.text) &&
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

  const layout: DocLayoutMap = {
    master_doc_id: docId,
    version: 1,
    mapped_at: new Date().toISOString(),
    slots,
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
  };
}
