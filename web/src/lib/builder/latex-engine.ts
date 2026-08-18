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

function nonEmpty(values: readonly (string | undefined)[]): string[] {
  return values.filter((v): v is string => Boolean(v && v.trim()));
}

function headerSection(profile: BuilderProfile): string {
  const name = escapeLatex(profile.name ?? "");
  const contact = profile.contact ?? {};
  const items: string[] = [];

  if (contact.phone) {
    const phone = escapeLatex(contact.phone);
    items.push(String.raw`\faMobile \hspace{.5pt} \href{tel:${phone}}{${phone}}`);
  }
  if (contact.email) {
    const email = escapeLatex(contact.email);
    items.push(String.raw`\faAt \hspace{.5pt} \href{mailto:${email}}{${email}}`);
  }
  if (contact.linkedin) {
    items.push(
      String.raw`\faLinkedinSquare \hspace{.5pt} \href{${escapeLatex(contact.linkedin)}}{LinkedIn}`,
    );
  }
  if (contact.github) {
    items.push(
      String.raw`\faGithub \hspace{.5pt} \href{${escapeLatex(contact.github)}}{GitHub}`,
    );
  }
  if (contact.portfolio) {
    items.push(
      String.raw`\faGlobe \hspace{.5pt} \href{${escapeLatex(contact.portfolio)}}{Portfolio}`,
    );
  }
  if (contact.website) {
    items.push(
      String.raw`\faGlobe \hspace{.5pt} \href{${escapeLatex(contact.website)}}{Website}`,
    );
  }
  if (contact.twitter) {
    items.push(
      String.raw`\faTwitter \hspace{.5pt} \href{${escapeLatex(contact.twitter)}}{Twitter}`,
    );
  }
  if (contact.location) {
    items.push(String.raw`\faMapMarker \hspace{.2pt} ${escapeLatex(contact.location)}`);
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
  return `\\section{Professional Summary}\n\\small{${escapeLatex(summary)}}\n`;
}

function educationSection(education: BuilderEducation[]): string {
  if (!education?.length) return "";
  const lines = [
    String.raw`\section{Education}`,
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
    String.raw`\section{Work Experience}`,
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
    String.raw`\section{Projects}`,
    String.raw`\vspace{3pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const proj of projects) {
    let rightCol = "";
    if (proj.demo_link) {
      rightCol = ` \\emph{\\href{${proj.demo_link}}{\\color{blue}Demo}}`;
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
    String.raw`\section{Skills}`,
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
    String.raw`\section{Certifications}`,
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
    String.raw`\section{Publications}`,
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
    String.raw`\section{Awards \& Honors}`,
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
    String.raw`\section{Volunteer Experience}`,
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
    String.raw`\section{Languages}`,
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
    String.raw`\section{Relevant Coursework}`,
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

/** Build the complete LaTeX document for a builder profile. */
export function generateLatexContent(profile: BuilderProfile): string {
  const field = isProfessionalField(profile.professional_field)
    ? profile.professional_field
    : "general";

  const order: SectionName[] = [...FIELD_SECTION_ORDER[field]];
  // Sections the user filled in that their field's default order omits still
  // belong on the page — append them rather than dropping the data.
  for (const name of Object.keys(SECTION_GENERATORS) as SectionName[]) {
    if (!order.includes(name)) {
      const value = (profile as unknown as Record<string, unknown>)[name];
      if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
        order.push(name);
      }
    }
  }

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
