/**
 * Resume Builder profile shape.
 *
 * Ported from ResumeBuilderV2's `models.py` (UserProfileV2). The Clerk id is
 * dropped — builder rows are keyed by our own `users.id` — and credits moved
 * out to `user_entitlements`, which also governs Apply.
 */

export const PROFESSIONAL_FIELDS = [
  "tech",
  "sales",
  "marketing",
  "finance",
  "healthcare",
  "education",
  "design",
  "legal",
  "hr",
  "general",
] as const;

export type ProfessionalField = (typeof PROFESSIONAL_FIELDS)[number];

export function isProfessionalField(value: string): value is ProfessionalField {
  return (PROFESSIONAL_FIELDS as readonly string[]).includes(value);
}

export const FIELD_LABELS: Record<ProfessionalField, string> = {
  tech: "Technology / Engineering",
  sales: "Sales",
  marketing: "Marketing",
  finance: "Finance",
  healthcare: "Healthcare",
  education: "Education / Academia",
  design: "Design",
  legal: "Legal",
  hr: "Human Resources",
  general: "General",
};

export interface BuilderContact {
  phone?: string;
  location?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
  twitter?: string;
}

export interface BuilderEducation {
  institution: string;
  location?: string;
  degree: string;
  gpa?: string;
  graduation_date?: string;
}

export interface BuilderExperience {
  company: string;
  role: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  description: string[];
}

export interface BuilderProject {
  name: string;
  demo_link?: string;
  technologies?: string;
  description: string[];
}

export interface BuilderSkillCategory {
  category_name: string;
  skills: string[];
}

export interface BuilderPublication {
  title: string;
  publisher?: string;
  date?: string;
  url?: string;
  summary?: string;
}

export interface BuilderAward {
  title: string;
  awarder?: string;
  date?: string;
  summary?: string;
}

export interface BuilderVolunteer {
  organization: string;
  role: string;
  start_date?: string;
  end_date?: string;
  description: string[];
}

export interface BuilderCoursework {
  major_coursework: string[];
  minor_coursework: string[];
}

export interface BuilderCustomSection {
  title: string;
  items: string[];
}

export interface BuilderProfile {
  name: string;
  professional_field: ProfessionalField;
  professional_summary?: string;
  contact: BuilderContact;
  education: BuilderEducation[];
  experience: BuilderExperience[];
  skills: BuilderSkillCategory[];
  projects?: BuilderProject[];
  certifications?: string[];
  publications?: BuilderPublication[];
  awards?: BuilderAward[];
  volunteer?: BuilderVolunteer[];
  languages?: string[];
  coursework?: BuilderCoursework;
  custom_sections?: BuilderCustomSection[];
}

export function emptyBuilderProfile(name = ""): BuilderProfile {
  return {
    name,
    professional_field: "general",
    contact: {},
    education: [],
    experience: [],
    skills: [],
  };
}
