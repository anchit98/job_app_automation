/**
 * Per-field builder configuration.
 *
 * Ported from ResumeBuilderV2's FIELD_FORM_SECTIONS, plus one addition: which
 * contact links each field actually uses. A developer's GitHub is a headline
 * credential; on a nurse's CV it is noise. Rather than hide the field outright
 * (people do have side projects), irrelevant links move behind "More links" so
 * the default form only asks for what that profession is judged on.
 *
 * `sections` intentionally mirrors FIELD_SECTION_ORDER in latex-engine.ts —
 * that array drives the PDF, this one drives the form and preview.
 */
import type { ProfessionalField } from "@/lib/builder/types";

/** Optional contact links, beyond the always-present email / phone / location. */
export type ContactLinkKey = "linkedin" | "github" | "portfolio" | "website" | "twitter";

export interface FieldConfig {
  label: string;
  /** Skill category names offered as one-tap chips. */
  skillSuggestions: string[];
  /** Links shown by default — the ones this profession is judged on. */
  primaryLinks: ContactLinkKey[];
}

const ALL_LINKS: ContactLinkKey[] = [
  "linkedin",
  "github",
  "portfolio",
  "website",
  "twitter",
];

export const FIELD_CONFIG: Record<ProfessionalField, FieldConfig> = {
  tech: {
    label: "Technology",
    skillSuggestions: [
      "Programming Languages",
      "Frameworks & Libraries",
      "Databases",
      "Cloud & DevOps",
      "Tools",
    ],
    primaryLinks: ["linkedin", "github", "portfolio"],
  },
  sales: {
    label: "Sales",
    skillSuggestions: [
      "CRM Tools",
      "Sales Methodologies",
      "Negotiation",
      "Lead Generation",
      "Industry Knowledge",
    ],
    primaryLinks: ["linkedin"],
  },
  marketing: {
    label: "Marketing",
    skillSuggestions: [
      "Digital Marketing",
      "Analytics Tools",
      "Content Strategy",
      "Social Media",
      "SEO/SEM",
    ],
    primaryLinks: ["linkedin", "portfolio", "twitter"],
  },
  finance: {
    label: "Finance",
    skillSuggestions: [
      "Financial Analysis",
      "Accounting Software",
      "Risk Management",
      "Compliance",
      "Excel & Modeling",
    ],
    primaryLinks: ["linkedin"],
  },
  healthcare: {
    label: "Healthcare",
    skillSuggestions: [
      "Clinical Skills",
      "Patient Care",
      "Medical Software",
      "Research Methods",
      "Compliance",
    ],
    primaryLinks: ["linkedin"],
  },
  education: {
    label: "Education",
    skillSuggestions: [
      "Teaching Methods",
      "Curriculum Design",
      "Ed-Tech Tools",
      "Assessment",
      "Research",
    ],
    // Academics link a profile page (Scholar / department) far more than a repo.
    primaryLinks: ["linkedin", "website"],
  },
  design: {
    label: "Design",
    skillSuggestions: [
      "Design Tools",
      "UI/UX",
      "Typography",
      "Branding",
      "Motion Graphics",
    ],
    // The portfolio is the CV for designers.
    primaryLinks: ["portfolio", "linkedin", "website"],
  },
  legal: {
    label: "Legal",
    skillSuggestions: [
      "Practice Areas",
      "Legal Research",
      "Case Management",
      "Compliance",
      "Bar Admissions",
    ],
    primaryLinks: ["linkedin"],
  },
  hr: {
    label: "Human Resources",
    skillSuggestions: [
      "HRIS Systems",
      "Recruitment",
      "Employee Relations",
      "Compensation & Benefits",
      "Training",
    ],
    primaryLinks: ["linkedin"],
  },
  general: {
    label: "General",
    skillSuggestions: [
      "Technical Skills",
      "Soft Skills",
      "Tools & Software",
      "Languages",
    ],
    primaryLinks: ["linkedin", "portfolio"],
  },
};

export const LINK_LABELS: Record<ContactLinkKey, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  portfolio: "Portfolio",
  website: "Website",
  twitter: "Twitter / X",
};

/** Links this field does not lead with — offered under "More links". */
export function secondaryLinks(field: ProfessionalField): ContactLinkKey[] {
  const primary = FIELD_CONFIG[field].primaryLinks;
  return ALL_LINKS.filter((l) => !primary.includes(l));
}
