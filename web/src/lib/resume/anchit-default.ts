import fs from "fs";
import path from "path";

/** Canonical Anchit master resume — synced from masterresume/anchit-master-resume.json */
export function loadAnchitMasterResumeDefault(): Record<string, unknown> {
  const jsonPath = path.join(
    process.cwd(),
    "..",
    "masterresume",
    "anchit-master-resume.json",
  );
  if (!fs.existsSync(jsonPath)) {
    return {
      headline: "Product Manager | AI & Automation | 0-to-1 Products",
      experience: [],
      projects: [],
      skills: [],
      education: [],
    };
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
}
