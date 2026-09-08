/**
 * LaTeX resume generator, ported from ResumeBuilderV2's `latex_engine.py`.
 *
 * Section ordering is chosen by the user's professional field; sections with
 * no data drop out. Output is a complete LaTeX document ready to compile.
 */
import { BASE_TEMPLATE } from "@/lib/builder/latex-template";
import {
  type BuilderAward,
  type BuilderCoursework,
  type BuilderCustomSection,
  type BuilderEducation,
  type BuilderExperience,
  type BuilderProfile,
  type BuilderProject,
  type BuilderPublication,
  type BuilderSkillCategory,
  type BuilderVolunteer,
  type ProfessionalField,
  isProfessionalField,
} from "@/lib/builder/types";

export type SectionName =
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "certifications"
  | "publications"
  | "awards"
  | "volunteer"
  | "languages"
  | "coursework";

/**
 * Section headings exactly as they are printed on the PDF.
 *
 * The live preview reads the same map, so a heading can never say "Summary" on
 * screen and "Professional Summary" on the page.
 */
export const SECTION_LABELS: Record<SectionName, string> = {
  summary: "Professional Summary",
  education: "Education",
  experience: "Work Experience",
  projects: "Projects",
  skills: "Skills",
  certifications: "Certifications",
  publications: "Publications",
  awards: "Awards & Honors",
  volunteer: "Volunteer Experience",
  languages: "Languages",
  coursework: "Relevant Coursework",
};

/** Every section name, in the canonical order used when appending extras. */
export const SECTION_NAMES = Object.keys(SECTION_LABELS) as SectionName[];

/** Also drives which sections the live preview renders, and in what order. */
export const FIELD_SECTION_ORDER: Record<ProfessionalField, SectionName[]> = {
  tech: [
    "summary", "education", "experience", "projects",
    "skills", "certifications", "coursework",
  ],
  sales: ["summary", "experience", "skills", "education", "awards", "certifications"],
  marketing: ["summary", "experience", "skills", "projects", "education", "certifications"],
  finance: ["summary", "education", "experience", "skills", "certifications", "awards"],
  healthcare: [
    "summary", "education", "experience", "publications",
    "skills", "certifications",
  ],
  education: [
    "summary", "education", "experience", "publications",
    "skills", "coursework", "awards",
  ],
  design: ["summary", "experience", "projects", "skills", "education", "awards"],
  legal: [
    "summary", "education", "experience", "skills",
    "publications", "awards", "certifications",
  ],
  hr: ["summary", "experience", "skills", "education", "certifications", "awards"],
  general: [
    "summary", "education", "experience", "skills", "projects",
    "certifications", "volunteer", "languages", "awards",
  ],
};

/**
 * Escape LaTeX control characters in user text.
 *
 * Backslash is handled first and its replacement contains braces, so the other
 * rules must not run over it again — a single pass with one alternation keeps
 * that safe.
 */
export function escapeLatex(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  const replacements: Record<string, string> = {
    "\\": String.raw`\textbackslash{}`,
    "&": String.raw`\&`,
    "%": String.raw`\%`,
    $: String.raw`\$`,
    "#": String.raw`\#`,
    "{": String.raw`\{`,
    "}": String.raw`\}`,
    "~": String.raw`\textasciitilde{}`,
    "^": String.raw`\textasciicircum{}`,
  };
  return text.replace(/[\\&%$#{}~^]/g, (ch) => replacements[ch] ?? ch);
}

/**
 * Give a link a scheme so it actually opens.
 *
 * People type "linkedin.com/in/me" into the LinkedIn field, and a link written
 * without a scheme is relative — clicking it in a PDF or a Doc goes nowhere.
 * Shared with the Doc writer so both renderings of the CV link to the same
 * place.
 */
export function normalizeLinkUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  return `https://${url}`;
}

/**
 * Escape a URL for the first argument of \href.
 *
 * Only the characters TeX consumes before hyperref can see them are escaped —
 * comment, parameter, group, alignment and math-shift. A query string's `&` is
 * the one that actually bit: a project demo link sits inside a tabular cell,
 * where a bare `&` reads as a column break. `~` and `_` are legal in URLs and
 * hyperref passes them through, so escaping the full set (as escapeLatex does)
 * would corrupt the link itself.
 */
export function escapeLatexUrl(value: string | undefined): string {
  if (!value) return "";
  return normalizeLinkUrl(value)
    // A backslash is never valid in a URL and is the one character hyperref
    // cannot recover from — drop it rather than trying to escape it.
    .replace(/\\/g, "")
    .replace(/([%#{}&$])/g, "\\$1");
}

/** The section-heading line, titled from the shared label map. */
function sectionHeading(name: SectionName): string {
  return `\\section{${escapeLatex(SECTION_LABELS[name])}}`;
}

function nonEmpty(values: readonly (string | undefined)[]): string[] {
  return values.filter((v): v is string => Boolean(v && v.trim()));
}

/**
 * The name and contact row.
 *
 * Every item is either its own value or the name of the thing it links to —
 * no icons. See the note in the base template: an icon glyph is invisible to
 * the ATS parsing this PDF, and turns into a stray "Æ" in front of the phone
 * number the moment anything extracts the text.
 */
function headerSection(profile: BuilderProfile): string {
  const name = escapeLatex(profile.name ?? "");
  const contact = profile.contact ?? {};
  const items: string[] = [];

  if (contact.phone) {
    const phone = escapeLatex(contact.phone);
    items.push(String.raw`\href{tel:${phone}}{${phone}}`);
  }
  if (contact.email) {
    const email = escapeLatex(contact.email);
    items.push(String.raw`\href{mailto:${email}}{${email}}`);
  }
  if (contact.linkedin) {
    items.push(String.raw`\href{${escapeLatexUrl(contact.linkedin)}}{LinkedIn}`);
  }
  if (contact.github) {
    items.push(String.raw`\href{${escapeLatexUrl(contact.github)}}{GitHub}`);
  }
  if (contact.portfolio) {
    items.push(String.raw`\href{${escapeLatexUrl(contact.portfolio)}}{Portfolio}`);
  }
  if (contact.website) {
    items.push(String.raw`\href{${escapeLatexUrl(contact.website)}}{Website}`);
  }
  if (contact.twitter) {
    items.push(String.raw`\href{${escapeLatexUrl(contact.twitter)}}{Twitter}`);
  }
  if (contact.location) {
    items.push(escapeLatex(contact.location));
  }

  return [
    String.raw`\begin{center}`,
    String.raw`    \textbf{\Huge \scshape ${name}} \\ \vspace{3pt}`,
    String.raw`    \small`,
    "    " + items.join("\n    $|$\n    "),
    String.raw`\end{center}`,
  ].join("\n");
}

function summarySection(profile: BuilderProfile): string {
  const summary = profile.professional_summary;
  if (!summary?.trim()) return "";
  return `${sectionHeading("summary")}\n\\small{${escapeLatex(summary)}}\n`;
}

function educationSection(education: BuilderEducation[]): string {
  if (!education?.length) return "";
  const lines = [
    sectionHeading("education"),
    String.raw`\vspace{-1pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const edu of education) {
    lines.push(
      `\\resumeEducationHeading{${escapeLatex(edu.institution)}}{${escapeLatex(edu.location ?? "")}}{${escapeLatex(edu.degree)}}{${escapeLatex(edu.graduation_date ?? "")}}`,
    );
    if (edu.gpa) {
      lines.push(String.raw`\resumeItemListStart`);
      lines.push(`  \\resumeItem{GPA: ${escapeLatex(edu.gpa)}}`);
      lines.push(String.raw`\resumeItemListEnd`);
    }
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function bulletList(description: string[] | undefined): string[] {
  return nonEmpty(description ?? []).map(
    (desc) => `  \\resumeItem{${escapeLatex(desc)}}`,
  );
}

function experienceSection(experience: BuilderExperience[]): string {
  if (!experience?.length) return "";
  const lines = [
    sectionHeading("experience"),
    String.raw`\vspace{-1pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const job of experience) {
    lines.push(
      `\\resumeSubheading{${escapeLatex(job.company)}}{${escapeLatex(job.location ?? "")}}{${escapeLatex(job.role)}}{${escapeLatex(job.start_date ?? "")} -- ${escapeLatex(job.end_date ?? "")}}`,
    );
    lines.push(String.raw`\resumeItemListStart`);
    lines.push(...bulletList(job.description));
    lines.push(String.raw`\resumeItemListEnd`);
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function projectsSection(projects: BuilderProject[]): string {
  if (!projects?.length) return "";
  const lines = [
    sectionHeading("projects"),
    String.raw`\vspace{3pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const proj of projects) {
    let rightCol = "";
    if (proj.demo_link) {
      rightCol = ` \\emph{\\href{${escapeLatexUrl(proj.demo_link)}}{\\color{blue}Demo}}`;
    }
    if (proj.technologies) {
      const tech = `\\textit{\\small ${escapeLatex(proj.technologies)}}`;
      rightCol = rightCol ? `${rightCol} ${tech}` : tech;
    }
    lines.push(`\\resumeProjectHeading{${escapeLatex(proj.name)}}{${rightCol}}`);
    lines.push(String.raw`\resumeItemListStart`);
    lines.push(...bulletList(proj.description));
    lines.push(String.raw`\resumeItemListEnd`);
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function skillsSection(skills: BuilderSkillCategory[]): string {
  if (!skills?.length) return "";
  const lines = [
    sectionHeading("skills"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    String.raw`\small{\item{`,
  ];
  skills.forEach((cat, i) => {
    const list = nonEmpty(cat.skills ?? []).map(escapeLatex).join(", ");
    const separator = i < skills.length - 1 ? String.raw` \\ \vspace{3pt}` : "";
    lines.push(
      `  \\textbf{${escapeLatex(cat.category_name)}:} { ${list} }${separator}`,
    );
  });
  lines.push("}}");
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function certificationsSection(certifications: string[]): string {
  const items = nonEmpty(certifications ?? []);
  if (!items.length) return "";
  return [
    sectionHeading("certifications"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    String.raw`\resumeItemListStart`,
    ...items.map((c) => `  \\resumeItem{${escapeLatex(c)}}`),
    String.raw`\resumeItemListEnd`,
    String.raw`\resumeSubHeadingListEnd`,
  ].join("\n");
}

function publicationsSection(publications: BuilderPublication[]): string {
  if (!publications?.length) return "";
  const lines = [
    sectionHeading("publications"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const pub of publications) {
    lines.push(
      `\\resumePublicationHeading{${escapeLatex(pub.title)}}{${escapeLatex(pub.date ?? "")}}{${escapeLatex(pub.publisher ?? "")}}`,
    );
    if (pub.summary?.trim()) {
      lines.push(String.raw`\resumeItemListStart`);
      lines.push(`  \\resumeItem{${escapeLatex(pub.summary)}}`);
      lines.push(String.raw`\resumeItemListEnd`);
    }
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function awardsSection(awards: BuilderAward[]): string {
  if (!awards?.length) return "";
  const lines = [
    sectionHeading("awards"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const award of awards) {
    lines.push(
      `\\resumeAwardHeading{${escapeLatex(award.title)}}{${escapeLatex(award.date ?? "")}}{${escapeLatex(award.awarder ?? "")}}`,
    );
    if (award.summary?.trim()) {
      lines.push(String.raw`\resumeItemListStart`);
      lines.push(`  \\resumeItem{${escapeLatex(award.summary)}}`);
      lines.push(String.raw`\resumeItemListEnd`);
    }
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function volunteerSection(volunteer: BuilderVolunteer[]): string {
  if (!volunteer?.length) return "";
  const lines = [
    sectionHeading("volunteer"),
    String.raw`\vspace{-1pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const vol of volunteer) {
    const dates = vol.start_date
      ? `${escapeLatex(vol.start_date)} -- ${escapeLatex(vol.end_date ?? "")}`
      : "";
    lines.push(
      `\\resumeSubheading{${escapeLatex(vol.organization)}}{}{${escapeLatex(vol.role)}}{${dates}}`,
    );
    lines.push(String.raw`\resumeItemListStart`);
    lines.push(...bulletList(vol.description));
    lines.push(String.raw`\resumeItemListEnd`);
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function languagesSection(languages: string[]): string {
  const items = nonEmpty(languages ?? []);
  if (!items.length) return "";
  const list = items.map(escapeLatex).join(", ");
  return [
    sectionHeading("languages"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    `\\small{\\item{\\textbf{Languages:} { ${list} }}}`,
    String.raw`\resumeSubHeadingListEnd`,
    "",
  ].join("\n");
}

function courseworkSection(coursework: BuilderCoursework | undefined): string {
  const major = nonEmpty(coursework?.major_coursework ?? []);
  const minor = nonEmpty(coursework?.minor_coursework ?? []);
  if (!major.length && !minor.length) return "";
  const lines = [
    sectionHeading("coursework"),
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    String.raw`\small{\item{`,
  ];
  if (major.length) {
    const separator = minor.length ? String.raw` \\ \vspace{3pt}` : "";
    lines.push(
      `  \\textbf{Major coursework:} { ${major.map(escapeLatex).join(", ")} }${separator}`,
    );
  }
  if (minor.length) {
    lines.push(
      `  \\textbf{Minor coursework:} { ${minor.map(escapeLatex).join(", ")} }`,
    );
  }
  lines.push("}}");
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function customSection(section: BuilderCustomSection): string {
  const items = nonEmpty(section.items ?? []);
  if (!section.title?.trim() || !items.length) return "";
  return [
    `\\section{${escapeLatex(section.title)}}`,
    // The Python original emitted `\vspace{{2pt}}` here (doubled braces in a
    // non-f-string), which LaTeX renders as a stray "{2pt}". Fixed in the port.
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    String.raw`\resumeItemListStart`,
    ...items.map((item) => `  \\resumeItem{${escapeLatex(item)}}`),
    String.raw`\resumeItemListEnd`,
    String.raw`\resumeSubHeadingListEnd`,
  ].join("\n");
}

const SECTION_GENERATORS: Record<SectionName, (p: BuilderProfile) => string> = {
  summary: (p) => summarySection(p),
  education: (p) => educationSection(p.education ?? []),
  experience: (p) => experienceSection(p.experience ?? []),
  projects: (p) => projectsSection(p.projects ?? []),
  skills: (p) => skillsSection(p.skills ?? []),
  certifications: (p) => certificationsSection(p.certifications ?? []),
  publications: (p) => publicationsSection(p.publications ?? []),
  awards: (p) => awardsSection(p.awards ?? []),
  volunteer: (p) => volunteerSection(p.volunteer ?? []),
  languages: (p) => languagesSection(p.languages ?? []),
  coursework: (p) => courseworkSection(p.coursework),
};

/**
 * The exact section sequence this profile will be printed in.
 *
 * The field's default order first, then any section the user filled in that
 * the default omits — dropping that data would be worse than an unusual order.
 * Exported because the live preview must render the same sequence; while the
 * preview kept its own hard-coded order it was simply wrong about the CV.
 */
export function resolveSectionOrder(profile: BuilderProfile): SectionName[] {
  const field = isProfessionalField(profile.professional_field)
    ? profile.professional_field
    : "general";

  const order: SectionName[] = [...FIELD_SECTION_ORDER[field]];
  for (const name of SECTION_NAMES) {
    if (order.includes(name)) continue;
    const value = (profile as unknown as Record<string, unknown>)[name];
    const filled =
      name === "coursework"
        ? Boolean(
            profile.coursework?.major_coursework?.length ||
              profile.coursework?.minor_coursework?.length,
          )
        : Array.isArray(value)
          ? value.length > 0
          : Boolean(value);
    if (filled) order.push(name);
  }
  return order;
}

/** Build the complete LaTeX document for a builder profile. */
export function generateLatexContent(profile: BuilderProfile): string {
  const order = resolveSectionOrder(profile);

  const sections: string[] = [];
  for (const name of order) {
    const content = SECTION_GENERATORS[name](profile);
    if (content.trim()) sections.push(content);
  }
  for (const cs of profile.custom_sections ?? []) {
    const content = customSection(cs);
    if (content.trim()) sections.push(content);
  }

  return BASE_TEMPLATE.replace("% HEADER_PLACEHOLDER", headerSection(profile)).replace(
    "% SECTIONS_PLACEHOLDER",
    sections.join("\n\n"),
  );
}
