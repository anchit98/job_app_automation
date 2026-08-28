/**
 * Base LaTeX document, ported verbatim from ResumeBuilderV2's
 * `templates/base_template.tex`.
 *
 * Inlined as a string rather than read from disk: the Python version cached a
 * file read to survive serverless cold starts, and bundling the text removes
 * that concern along with any filesystem access at runtime.
 */
export const BASE_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}

% Must precede hyperref, which loads url itself: without this a long demo link
% is one unbreakable box that runs off the page.
\PassOptionsToPackage{hyphens}{url}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{array}
\usepackage{hyphenat}
\usepackage{fontawesome}
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
\setlength{\tabcolsep}{0in}

% Long unbroken tokens (stack lists, URLs in bullets) used to punch past the
% right margin. Let TeX stretch a line rather than overfull it.
\setlength{\emergencystretch}{3em}
\hbadness=10000

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small#4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small#2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeEducationHeading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small#4} \\
    \end{tabular*}\vspace{-5pt}
}

% Both cells wrap. The original used l and r columns, which are single-line:
% a project with a real tech stack ("React, Node.js, PostgreSQL, Redis, Docker,
% AWS Lambda") pushed the right cell straight off the page and over whatever
% sat beside it. Fixed-width p-columns let the stack run onto a second line
% instead, and \raggedleft keeps it flush right the way it was before.
\newcommand{\resumeProjectHeading}[2]{
    \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{@{}p{0.46\textwidth}@{\extracolsep{\fill}}>{\raggedleft\arraybackslash}p{0.46\textwidth}@{}}
     \textbf{#1} & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumePublicationHeading}[3]{
    \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
     \textbf{#1} & \textit{\small#2} \\
     \textit{\small#3} & \\
    \end{tabular*}\vspace{-5pt}
}

\newcommand{\resumeAwardHeading}[3]{
    \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
     \textbf{#1} & \textit{\small#2} \\
     \textit{\small#3} & \\
    \end{tabular*}\vspace{-5pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

% HEADER_PLACEHOLDER

% SECTIONS_PLACEHOLDER

\end{document}`;
