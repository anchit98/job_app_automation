import { throwAts, AtsReadinessError } from "@/lib/ats/readiness-error";
import type { SyncedMasterResume } from "@/lib/resume/master-sync";

/** One-line ATS reasons only — shown on Sync failure. */
export function collectResumeAtsIssues(
  synced: SyncedMasterResume,
  paragraphCount: number,
): string[] {
  const issues: string[] = [];

  if (paragraphCount < 5) {
    issues.push(
      "Use selectable Google Docs text (not a scanned image or empty Doc).",
    );
  }

  const roles = synced.content.experience.filter(
    (e) =>
      e.company.trim() &&
      e.company !== "-" &&
      e.title.trim() &&
      e.bullets.length > 0,
  );
  const expSlots = synced.layout.slots.filter((s) => s.section === "experience");
  const totalBullets = roles.reduce((n, r) => n + r.bullets.length, 0);

  if (roles.length === 0) {
    issues.push(
      "Add Work Experience with each achievement as its own bullet line.",
    );
  } else if (expSlots.length === 0) {
    issues.push(
      "Split experience achievements into separate paragraphs for ATS editing.",
    );
  } else if (totalBullets < 2) {
    issues.push(
      "Add more Work Experience bullets so JD keywords can be tailored.",
    );
  }

  const originals = synced.layout.slots.map((s) => s.original.trim());
  const seen = new Set<string>();
  for (const original of originals) {
    if (!original) continue;
    if (seen.has(original)) {
      issues.push(
        "Make each bullet/skill line unique — duplicates block ATS replace.",
      );
      break;
    }
    seen.add(original);
  }

  const hasProjectSlots = synced.layout.slots.some((s) => s.section === "project");
  const hasSkillSlots = synced.layout.slots.some((s) => s.section === "skill");
  if (
    roles.length > 0 &&
    expSlots.length > 0 &&
    !hasSkillSlots &&
    synced.content.skills.length === 0 &&
    !hasProjectSlots &&
    synced.content.projects.length === 0
  ) {
    // Soft guidance only if experience is thin
    if (totalBullets < 4) {
      issues.push(
        "Add a Skills or Projects/Case Studies section for stronger ATS keyword coverage.",
      );
    }
  }

  return issues;
}

export function assertResumeSyncAtsReady(
  synced: SyncedMasterResume,
  paragraphCount: number,
): void {
  const issues = collectResumeAtsIssues(synced, paragraphCount);
  // Hard-fail only on critical issues (first three categories), not soft skills tip alone
  const critical = issues.filter(
    (i) =>
      !i.startsWith("Add a Skills or Projects"),
  );
  if (critical.length > 0) {
    throw new AtsReadinessError(critical);
  }
}

export function mapResumeSyncFailureToAts(message: string): never {
  const m = message.toLowerCase();
  if (/empty/.test(m)) {
    throwAts(
      "Use selectable Google Docs text (not a scanned image or empty Doc).",
    );
  }
  if (/could not map|editable achievement|incomplete structure/.test(m)) {
    throwAts(
      "Add Work Experience with each achievement as its own bullet line.",
    );
  }
  if (/parse the ai|smart resume sync/.test(m)) {
    throwAts(
      "Could not read this resume layout — use clear Experience bullets, then Sync again.",
    );
  }
  throwAts(
    "Fix Experience / Projects / Case Studies / Skills as clear paragraphs, then Sync again.",
  );
}
