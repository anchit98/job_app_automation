import type { Application } from "@/lib/db/types";
import { wrapJdForPrompt } from "@/lib/jd/sanitize";
import type { ResumeContent } from "@/lib/resume/fabrication";

export function buildJdContent(application: Application): string {
  if (application.jd_parsed) {
    return `Parsed JD (structured):\n${JSON.stringify(application.jd_parsed, null, 2)}`;
  }
  return wrapJdForPrompt(application.jd_raw);
}

export function condenseMasterResume(
  content: ResumeContent,
  maxExperience = 2,
): ResumeContent {
  if (content.experience.length <= maxExperience) return content;
  return {
    ...content,
    experience: content.experience.slice(0, maxExperience),
    projects: content.projects.slice(0, 2),
  };
}

export function applicationFolderName(application: Application): string {
  const company = application.company?.trim() || "Unknown Company";
  const role = application.role?.trim() || "Unknown Role";
  return `${company} - ${role}`.replace(/[\\/:*?"<>|]/g, "-");
}
