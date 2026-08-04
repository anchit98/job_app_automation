/** Thrown when Doc sync fails ATS / structure checks. Message is UI-safe. */
export class AtsReadinessError extends Error {
  readonly ats_issues: string[];

  constructor(issues: string[]) {
    const unique = [
      ...new Set(issues.map((i) => i.trim()).filter(Boolean)),
    ];
    super(formatAtsSyncMessage(unique));
    this.name = "AtsReadinessError";
    this.ats_issues = unique;
  }
}

export function formatAtsSyncMessage(issues: string[]): string {
  if (issues.length === 0) {
    return "ATS readiness: Fix your Doc, then Sync again.";
  }
  if (issues.length === 1) {
    return `ATS readiness: ${issues[0]}`;
  }
  return [
    "ATS readiness — fix in your Doc, then Sync again:",
    ...issues.map((i) => `• ${i}`),
  ].join("\n");
}

export function throwAts(...issues: string[]): never {
  throw new AtsReadinessError(issues);
}
