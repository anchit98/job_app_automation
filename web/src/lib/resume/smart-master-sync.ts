import { z } from "zod";
import { generateWithOpenAI } from "@/lib/llm/openai";
import type { DocLayoutMap, DocSlot } from "@/lib/google/docs";
import { countWords } from "@/lib/resume/bullet-layout";
import type { ResumeWordBudget } from "@/lib/resume/word-budget";

export type DocParagraphLite = {
  index: number;
  text: string;
  isBullet: boolean;
};

export type SmartSyncedMasterResume = {
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
};

const smartSyncSchema = z.object({
  headline: z.string().optional().default(""),
  contact_line: z.string().optional().default(""),
  links_line: z.string().optional().default(""),
  experience: z
    .array(
      z.object({
        company: z.string().min(1),
        title: z.string().min(1),
        location: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        bullets: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  projects: z
    .array(
      z.object({
        name: z.string().min(1),
        subtitle: z.string().optional(),
        bullets: z.array(z.string().min(1)).default([]),
      }),
    )
    .default([]),
  skills: z.array(z.string().min(1)).default([]),
  education: z
    .array(
      z.object({
        institution_line: z.string().min(1),
        dates: z.string().optional().default(""),
      }),
    )
    .default([]),
  /**
   * Exact paragraph texts from the doc that should be rewritten per job
   * (bullets, skill lines, optional headline). Must match doc text exactly.
   */
  tailorable_lines: z
    .array(
      z.object({
        original: z.string().min(1),
        section: z.enum(["headline", "experience", "project", "skill"]),
        experience_index: z.number().int().nonnegative().optional(),
        bullet_index: z.number().int().nonnegative().optional(),
        project_index: z.number().int().nonnegative().optional(),
        skill_index: z.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
});

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function scoreSyncedResume(synced: SmartSyncedMasterResume): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  const { content, layout } = synced;
  const rolesWithBullets = content.experience.filter(
    (e) =>
      e.title.trim() &&
      e.company.trim() &&
      e.company !== "-" &&
      e.bullets.length > 0,
  );
  if (rolesWithBullets.length === 0) {
    reasons.push("no_experience_with_bullets");
  } else {
    score += 40 + Math.min(20, rolesWithBullets.length * 5);
  }
  const bulletSlots = layout.slots.filter((s) => s.section === "experience").length;
  if (bulletSlots === 0) reasons.push("no_experience_slots");
  else score += Math.min(25, bulletSlots * 2);
  if (content.skills.length > 0) score += 10;
  if (layout.slots.some((s) => s.section === "skill")) score += 5;
  if ((layout.word_budget?.tailorable_words ?? 0) >= 80) score += 10;
  else if ((layout.word_budget?.tailorable_words ?? 0) === 0) {
    reasons.push("zero_tailorable_words");
  }
  return { score, reasons };
}

export function heuristicSyncLooksWeak(synced: SmartSyncedMasterResume): boolean {
  const { score } = scoreSyncedResume(synced);
  if (score < 50) return true;

  const rolesWithBullets = synced.content.experience.filter(
    (e) =>
      e.title.trim() &&
      e.company.trim() &&
      e.company !== "-" &&
      e.bullets.length > 0,
  );
  const expSlots = synced.layout.slots.filter((s) => s.section === "experience").length;
  // Many bullets under one role often means a padded 2nd job header was absorbed
  if (rolesWithBullets.length === 1 && expSlots >= 8) return true;

  const projSlots = synced.layout.slots.filter((s) => s.section === "project").length;
  if (synced.content.projects.length === 1 && projSlots >= 5) return true;

  return false;
}

/**
 * Template-aware agent: reads any Google Doc resume layout and produces
 * structured master content + replaceable slots keyed to exact Doc text.
 * Output PDFs still use the user's own Doc formatting via slot replace.
 */
export async function smartSyncMasterResumeFromParagraphs(
  docId: string,
  paragraphs: DocParagraphLite[],
): Promise<SmartSyncedMasterResume> {
  const numbered = paragraphs
    .filter((p) => p.text.trim().length > 0)
    .map(
      (p) =>
        `[${p.index}]${p.isBullet ? " (bullet)" : ""} ${p.text}`,
    )
    .join("\n");

  const prompt = `You are the JobApp OS master-resume template agent.

A user synced a Google Docs resume. Layouts vary — do NOT require fixed section titles.
Map THEIR document into our automation model while keeping THEIR visual format
(we replace exact paragraph texts in their Doc on Apply).

TAILORABLE SECTIONS (JD keyword REPLACE targets — these matter most):
1. Headline / professional title line (if present under the name)
2. Work Experience / Experience / Employment / Career History (and adjacent names)
3. Projects / Key Projects / Selected Projects (and adjacent names)
4. Case Studies / Portfolio case studies (treat like projects — same structure)
5. Skills / Technical Skills / Tech Stack / Tools (and adjacent names)

Do NOT put Education, contact details, or decorative lines into tailorable_lines
(except headline). Education is stored for context only.

Paragraphs from their Doc:
${numbered}

Return ONLY JSON with this shape:
{
  "headline": "string (role/tagline if present, else empty)",
  "contact_line": "string or empty",
  "links_line": "string or empty",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string optional",
      "start_date": "string optional",
      "end_date": "string optional",
      "bullets": ["achievement lines under that role"]
    }
  ],
  "projects": [
    {
      "name": "string (project OR case-study title)",
      "subtitle": "optional stack/line",
      "bullets": ["optional achievement lines"]
    }
  ],
  "skills": ["skill category lines or skill lists as they appear"],
  "education": [
    { "institution_line": "school/degree line", "dates": "optional dates or empty string" }
  ],
  "tailorable_lines": [
    {
      "original": "EXACT paragraph text from the list above (copy verbatim)",
      "section": "headline" | "experience" | "project" | "skill",
      "experience_index": 0,
      "bullet_index": 0,
      "project_index": 0,
      "skill_index": 0
    }
  ]
}

Rules:
1. experience must include real jobs with at least one bullet each when the Doc has them.
2. Merge Case Studies into "projects" (same array); preserve Doc order.
3. Treat achievement lines as bullets even without Google bullet formatting.
4. Ignore page furniture (rules, lone "|", decorative lines).
5. Do not invent employers, titles, metrics, or skills absent from the paragraphs.
6. education dates may be empty.
7. tailorable_lines.original MUST match a paragraph string above exactly.
   Include: headline (if any), experience bullets, project/case-study bullets, skill lines.
   Skip fixed role/company header lines and education lines.
8. Indices in tailorable_lines refer to your experience/projects/skills arrays (0-based).`;

  const generated = await generateWithOpenAI({
    prompt,
    kind: "master_resume_sync",
    maxTokens: 8192,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(generated.content));
  } catch {
    throw new Error(
      "Smart resume sync could not parse the AI response. Please retry Sync from Google Doc.",
    );
  }

  const parsed = smartSyncSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      "Smart resume sync returned incomplete structure. Ensure the Doc has work experience with achievements, then retry Sync.",
    );
  }

  const data = parsed.data;
  const paragraphTexts = new Set(
    paragraphs.map((p) => p.text).filter((t) => t.trim().length > 0),
  );

  const slots: DocSlot[] = [];
  const seen = new Set<string>();

  function pushSlot(slot: DocSlot) {
    const original = slot.original.trim();
    if (!original || seen.has(original)) return;
    if (!paragraphTexts.has(original) && !paragraphTexts.has(slot.original)) {
      // Allow only exact matches so replaceAllText is safe
      return;
    }
    seen.add(original);
    slots.push({ ...slot, original, word_count: countWords(original) });
  }

  if (data.headline && paragraphTexts.has(data.headline)) {
    pushSlot({
      key: "headline",
      original: data.headline,
      section: "headline",
    });
  }

  for (const line of data.tailorable_lines) {
    const section = line.section;
    if (section === "headline") {
      pushSlot({
        key: "headline",
        original: line.original,
        section: "headline",
      });
      continue;
    }
    if (section === "experience") {
      const ei = line.experience_index ?? 0;
      const bi = line.bullet_index ?? 0;
      pushSlot({
        key: `exp_${ei}_bullet_${bi}`,
        original: line.original,
        section: "experience",
        experience_index: ei,
        bullet_index: bi,
      });
      continue;
    }
    if (section === "project") {
      const pi = line.project_index ?? 0;
      const bi = line.bullet_index ?? 0;
      pushSlot({
        key: `proj_${pi}_bullet_${bi}`,
        original: line.original,
        section: "project",
        project_index: pi,
        bullet_index: bi,
      });
      continue;
    }
    if (section === "skill") {
      const si = line.skill_index ?? slots.filter((s) => s.section === "skill").length;
      pushSlot({
        key: `skill_${si}`,
        original: line.original,
        section: "skill",
        skill_index: si,
      });
    }
  }

  // Fallback: if model forgot tailorable_lines, map bullets/skills by exact text match
  if (slots.filter((s) => s.section === "experience").length === 0) {
    data.experience.forEach((role, ei) => {
      role.bullets.forEach((b, bi) => {
        pushSlot({
          key: `exp_${ei}_bullet_${bi}`,
          original: b,
          section: "experience",
          experience_index: ei,
          bullet_index: bi,
        });
      });
    });
  }
  if (slots.filter((s) => s.section === "skill").length === 0) {
    data.skills.forEach((sk, si) => {
      pushSlot({
        key: `skill_${si}`,
        original: sk,
        section: "skill",
        skill_index: si,
      });
    });
  }
  if (slots.filter((s) => s.section === "project").length === 0) {
    data.projects.forEach((proj, pi) => {
      proj.bullets.forEach((b, bi) => {
        pushSlot({
          key: `proj_${pi}_bullet_${bi}`,
          original: b,
          section: "project",
          project_index: pi,
          bullet_index: bi,
        });
      });
    });
  }

  const tailorableWords = slots
    .filter((s) => s.section !== "headline")
    .reduce((n, s) => n + countWords(s.original), 0);
  const wordBudget: ResumeWordBudget = {
    work_through_skills_total: tailorableWords,
    fixed_line_words: 0,
    tailorable_words: tailorableWords,
  };

  if (slots.filter((s) => s.section === "experience").length === 0) {
    throw new Error(
      "Smart resume sync could not map editable achievement lines in the Doc. Check that experience bullets exist as their own paragraphs, then retry Sync.",
    );
  }

  const layout: DocLayoutMap = {
    master_doc_id: docId,
    version: 2,
    mapped_at: new Date().toISOString(),
    slots,
    word_budget: wordBudget,
  };

  return {
    content: {
      headline: data.headline ?? "",
      contact_line: data.contact_line ?? "",
      links_line: data.links_line ?? "",
      experience: data.experience,
      projects: data.projects.map((p) => ({
        name: p.name,
        subtitle: p.subtitle,
        bullets: p.bullets ?? [],
      })),
      skills: data.skills,
      education: data.education.map((e) => ({
        institution_line: e.institution_line,
        dates: e.dates ?? "",
      })),
    },
    layout,
  };
}

export { scoreSyncedResume };
