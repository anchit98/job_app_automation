/**
 * Render a tailored resume with the CV builder's LaTeX template.
 *
 * Apply produces the tailored resume by copying the user's own master Google
 * Doc and swapping text into it. That keeps their layout, which is the right
 * instinct — but the layout is only as good as the Doc, and a master that
 * arrived as a PDF conversion or someone else's template turns every tailored
 * copy into the same mess. The text was fine; the page was not.
 *
 * The tailored content is already structured — headline, experience with
 * bullets, projects, skills, education — which is exactly what the builder's
 * template wants. So the PDF is typeset here instead, and comes out looking
 * like a CV the builder made. The Doc copy still happens alongside it, so
 * anyone who wants their own layout can still open and edit that.
 *
 * Contact details come from the profile rather than the resume's
 * `contact_line` / `links_line`: those are pre-formatted strings lifted out of
 * whatever the master looked like, and re-parsing them to re-typeset them is a
 * guess where the profile is a fact.
 */
import { BASE_TEMPLATE } from "@/lib/builder/latex-template";
import { escapeLatex, escapeLatexUrl } from "@/lib/builder/latex-engine";
import type { ResumeContent } from "@/lib/resume/fabrication";

export interface TailoredResumeIdentity {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
}

export interface TailoredResumeLatexInput {
  content: ResumeContent;
  profile: TailoredResumeIdentity;
}

/** Name, contact row, and the JD-targeted headline under it. */
function header(
  profile: TailoredResumeIdentity,
  headline: string | undefined,
): string {
  const items: string[] = [];

  if (profile.phone?.trim()) {
    const phone = escapeLatex(profile.phone.trim());
    items.push(String.raw`\href{tel:${phone}}{${phone}}`);
  }
  if (profile.email?.trim()) {
    const email = escapeLatex(profile.email.trim());
    items.push(String.raw`\href{mailto:${email}}{${email}}`);
  }
  if (profile.linkedin_url?.trim()) {
    items.push(String.raw`\href{${escapeLatexUrl(profile.linkedin_url)}}{LinkedIn}`);
  }
  if (profile.github_url?.trim()) {
    items.push(String.raw`\href{${escapeLatexUrl(profile.github_url)}}{GitHub}`);
  }
  if (profile.portfolio_url?.trim()) {
    items.push(String.raw`\href{${escapeLatexUrl(profile.portfolio_url)}}{Portfolio}`);
  }
  if (profile.location?.trim()) {
    items.push(escapeLatex(profile.location.trim()));
  }

  const lines = [
    String.raw`\begin{center}`,
    String.raw`    \textbf{\Huge \scshape ${escapeLatex(profile.full_name || "Candidate")}} \\ \vspace{3pt}`,
    String.raw`    \small`,
    items.length > 0 ? "    " + items.join("\n    $|$\n    ") : "",
  ];

  // The headline is the one line that changes per application — it belongs
  // directly under the name, not buried in a summary section.
  if (headline?.trim()) {
    lines.push(String.raw`    \\ \vspace{4pt}`);
    lines.push(`    \\textit{${escapeLatex(headline.trim())}}`);
  }

  lines.push(String.raw`\end{center}`);
  return lines.filter(Boolean).join("\n");
}

function summarySection(summary: string | undefined): string {
  if (!summary?.trim()) return "";
  return `\\section{Professional Summary}\n\\small{${escapeLatex(summary.trim())}}\n`;
}

function bullets(list: string[] | undefined): string[] {
  return (list ?? [])
    .filter((b) => b?.trim())
    .map((b) => `  \\resumeItem{${escapeLatex(b.trim())}}`);
}

function experienceSection(experience: ResumeContent["experience"]): string {
  if (!experience?.length) return "";
  const lines = [
    String.raw`\section{Work Experience}`,
    String.raw`\vspace{-1pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const job of experience) {
    const dates = [job.start_date, job.end_date]
      .map((d) => d?.trim())
      .filter(Boolean)
      .join(" -- ");
    lines.push(
      `\\resumeSubheading{${escapeLatex(job.company)}}{${escapeLatex(job.location ?? "")}}{${escapeLatex(job.title)}}{${escapeLatex(dates)}}`,
    );
    lines.push(String.raw`\resumeItemListStart`);
    lines.push(...bullets(job.bullets));
    lines.push(String.raw`\resumeItemListEnd`);
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

function projectsSection(projects: ResumeContent["projects"]): string {
  if (!projects?.length) return "";
  const lines = [
    String.raw`\section{Projects}`,
    String.raw`\vspace{3pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const project of projects) {
    const right: string[] = [];
    if (project.website_url?.trim()) {
      right.push(
        `\\emph{\\href{${escapeLatexUrl(project.website_url)}}{\\color{blue}Link}}`,
      );
    }
    if (project.subtitle?.trim()) {
      right.push(`\\textit{\\small ${escapeLatex(project.subtitle.trim())}}`);
    }
    lines.push(
      `\\resumeProjectHeading{${escapeLatex(project.name)}}{${right.join(" ")}}`,
    );
    lines.push(String.raw`\resumeItemListStart`);
    lines.push(...bullets(project.bullets));
    lines.push(String.raw`\resumeItemListEnd`);
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

/**
 * Skills, keeping whatever grouping the master used.
 *
 * A tailored skills entry is either "Category: a, b, c" or a bare list. The
 * first form gets a bold category and plain items after the colon; the second
 * is printed as its own line. Splitting on the first colon only — "Tools:
 * Docker, k8s: the good parts" must not lose its tail.
 */
function skillsSection(skills: string[]): string {
  const rows = (skills ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  if (!rows.length) return "";

  const lines = [
    String.raw`\section{Skills}`,
    String.raw`\vspace{2pt}`,
    String.raw`\resumeSubHeadingListStart`,
    String.raw`\small{\item{`,
  ];
  rows.forEach((row, i) => {
    const sep = row.indexOf(":");
    const separator = i < rows.length - 1 ? String.raw` \\ \vspace{3pt}` : "";
    if (sep > 0) {
      const label = escapeLatex(row.slice(0, sep).trim());
      const rest = escapeLatex(row.slice(sep + 1).trim());
      lines.push(`  \\textbf{${label}:} { ${rest} }${separator}`);
    } else {
      lines.push(`  { ${escapeLatex(row)} }${separator}`);
    }
  });
  lines.push("}}");
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

/**
 * Education.
 *
 * The tailored shape carries one `institution_line` rather than separate
 * institution and degree fields. An em dash, en dash or comma is the usual
 * split; without one the whole line is the institution, which still prints
 * correctly — just without a second line under it.
 */
function educationSection(education: ResumeContent["education"]): string {
  if (!education?.length) return "";
  const lines = [
    String.raw`\section{Education}`,
    String.raw`\vspace{-1pt}`,
    String.raw`\resumeSubHeadingListStart`,
  ];
  for (const entry of education) {
    const line = entry.institution_line?.trim() ?? "";
    const split = line.match(/^(.*?)\s*[—–,|]\s*(.+)$/);
    const institution = split ? split[1] : line;
    const degree = split ? split[2] : "";
    lines.push(
      `\\resumeEducationHeading{${escapeLatex(institution)}}{${escapeLatex(entry.dates ?? "")}}{${escapeLatex(degree)}}{}`,
    );
  }
  lines.push(String.raw`\resumeSubHeadingListEnd`);
  return lines.join("\n");
}

/** Build the complete LaTeX document for a tailored resume. */
export function generateTailoredResumeLatex(
  input: TailoredResumeLatexInput,
): string {
  const { content, profile } = input;

  const sections = [
    summarySection(content.summary),
    experienceSection(content.experience),
    projectsSection(content.projects),
    skillsSection(content.skills ?? []),
    educationSection(content.education),
  ].filter((s) => s.trim());

  return BASE_TEMPLATE.replace(
    "% HEADER_PLACEHOLDER",
    header(profile, content.headline),
  ).replace("% SECTIONS_PLACEHOLDER", sections.join("\n\n"));
}
