/**
 * LaTeX cover letter, built the same way the CV builder builds a resume.
 *
 * The app used to render a cover letter by copying a Google Doc the user had
 * uploaded and replacing text slots inside it. That made every cover letter
 * depend on a reference document the user had to find, sync and keep intact —
 * and it meant a Doc copy, two Docs batch updates, a PDF export and an upload
 * before anything could be downloaded. This composes the letter from the JD
 * output directly and compiles it, so there is nothing to sync and no template
 * to break.
 *
 * The header matches the resume's on purpose: the two documents arrive in the
 * same email, and a letterhead that does not match the resume looks like it
 * came from somebody else.
 */
import { escapeLatex, escapeLatexUrl } from "@/lib/builder/latex-engine";
import {
  assembleBodyFromSections,
  type CoverLetterContent,
} from "@/lib/cover-letter/validate";
import { mapContentToBodyParagraphs } from "@/lib/cover-letter/master-sync";
import { normalizeCoverLetterContent } from "@/lib/cover-letter/normalize";

export interface CoverLetterLetterhead {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
}

export interface CoverLetterLatexInput {
  content: CoverLetterContent;
  profile: CoverLetterLetterhead;
  company: string | null;
  role: string | null;
  /** Defaults to today. Injectable so a rebuild reproduces the same PDF. */
  date?: Date;
}

/**
 * One page, generous leading, no section rules.
 *
 * `parskip` rather than paragraph indents: a business letter separates
 * paragraphs with blank lines, and an indented first line reads as an essay.
 */
const COVER_LETTER_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}

\PassOptionsToPackage{hyphens}{url}

\usepackage[empty]{fullpage}
\usepackage[usenames,dvipsnames]{color}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{parskip}
\usepackage{hyphenat}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\emergencystretch}{3em}
\hbadness=10000

\pdfgentounicode=1

\begin{document}

% HEADER_PLACEHOLDER

% BODY_PLACEHOLDER

\end{document}`;

/** Same centred name-and-contact row the resume prints. */
function letterhead(profile: CoverLetterLetterhead): string {
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
    items.push(
      String.raw`\href{${escapeLatexUrl(profile.linkedin_url)}}{LinkedIn}`,
    );
  }
  if (profile.portfolio_url?.trim()) {
    items.push(
      String.raw`\href{${escapeLatexUrl(profile.portfolio_url)}}{Portfolio}`,
    );
  }
  if (profile.location?.trim()) {
    items.push(escapeLatex(profile.location.trim()));
  }

  return [
    String.raw`\begin{center}`,
    String.raw`    \textbf{\Huge \scshape ${escapeLatex(profile.full_name || "Candidate")}} \\ \vspace{3pt}`,
    String.raw`    \small`,
    items.length > 0 ? "    " + items.join("\n    $|$\n    ") : "",
    String.raw`\end{center}`,
    String.raw`\vspace{6pt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** "12 September 2026" — unambiguous on both sides of the Atlantic. */
function formatLetterDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function greetingFor(company: string | null): string {
  const trimmed = company?.trim();
  return trimmed ? `Dear ${trimmed} Hiring Team,` : "Dear Hiring Manager,";
}

/**
 * Turn one model paragraph into LaTeX.
 *
 * A soft line break inside a paragraph is a Docs artefact (vertical tab) that
 * the model output can still carry; in LaTeX it means nothing, so it becomes a
 * space rather than a stray glyph.
 */
function paragraph(text: string): string {
  return escapeLatex(text.replace(/\u000b/g, " ").replace(/\s+/g, " ").trim());
}

/** Build the complete LaTeX document for one cover letter. */
export function generateCoverLetterLatex(
  input: CoverLetterLatexInput,
): string {
  const { content, profile, company, role } = input;
  const date = input.date ?? new Date();

  // Render exactly what was validated. assembleBodyFromSections owns the one
  // rule for which of `body` and the section fields is the real letter, so
  // going through it here means the PDF cannot disagree with the check that
  // let this content through — and a hand-edited body still wins, because an
  // edited letter is at least as long as the sections it replaced.
  const normalized = normalizeCoverLetterContent(content);
  const prose = assembleBodyFromSections(normalized, profile.full_name, company ?? "");
  const paragraphs = (
    prose.trim() ? prose.split(/\n{2,}/) : mapContentToBodyParagraphs(normalized)
  )
    .map(paragraph)
    .filter(Boolean);

  const subjectLine = role?.trim()
    ? String.raw`\textbf{Re: ${escapeLatex(role.trim())}${
        company?.trim() ? ` at ${escapeLatex(company.trim())}` : ""
      }}`
    : "";

  const body = [
    escapeLatex(formatLetterDate(date)),
    "",
    subjectLine,
    subjectLine ? "" : null,
    escapeLatex(greetingFor(company)),
    "",
    paragraphs.join("\n\n"),
    "",
    String.raw`\vspace{6pt}`,
    "Warm regards,",
    "",
    String.raw`\textbf{${escapeLatex(profile.full_name || "Candidate")}}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return COVER_LETTER_TEMPLATE.replace(
    "% HEADER_PLACEHOLDER",
    letterhead(profile),
  ).replace("% BODY_PLACEHOLDER", body);
}
