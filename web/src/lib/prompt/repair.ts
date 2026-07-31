import type { ZodError } from "zod";

export function buildRepairPrompt(
  errors: { path: string; message: string }[],
  schemaDescription: string,
  previousResponseSnippet: string,
): string {
  const errorLines = errors
    .map((e) => `- ${e.path || "root"}: ${e.message}`)
    .join("\n");

  return `Your previous response failed validation with these errors:
${errorLines}

Please regenerate returning ONLY valid JSON matching this schema - no markdown, no prose:
${schemaDescription}

Previous response (for reference, do not repeat mistakes):
${previousResponseSnippet.slice(0, 500)}`;
}

/**
 * Focused repair prompt for resume bullets/skills that don't fit their line budget.
 * The message from the validator already describes the exact fix; we translate each
 * into a short instruction with a word delta so the AI can act without counting.
 */
export function buildResumeRepairPrompt(
  errors: { path: string; message: string; bullet?: string }[],
  previousResponseSnippet: string,
): string {
  const lines = errors.map((e) => {
    if (e.bullet && e.path.startsWith("skills")) {
      return `- ${e.path}: ${e.message}\n  Current: "${e.bullet.trim()}"`;
    }
    if (e.bullet) {
      return `- ${e.path}: ${e.message}\n  Current: "${e.bullet.trim()}"`;
    }
    return `- ${e.path}: ${e.message}`;
  });

  return `Fix ONLY the failing items in the resume JSON below.

Failing items:
${lines.join("\n")}

Rules:
- Surgical REPLACE only — swap JD keywords into existing words; do not insert new clauses that grow the line.
- Each fixed line must stay at or under the master line length (one-page PDF is mandatory).
- Every bullet must end as a complete finished sentence - never truncate mid-phrase or leave dangling words (and/that/prioritizing/across/etc.). Prefer a shorter complete sentence over an incomplete longer one.
- Skills: keep "Category:" prefix exact; REPLACE items after the colon; remove items if over the word ceiling.
- Total across ALL experience bullets + project bullets + skills: stay within the master word budget (shorter OK). Never truncate mid-sentence to hit the cap.
- Keep all master metrics; no fabrication.
- Change ONLY listed items - leave everything else identical.

Return ONLY the full corrected JSON.

Previous response:
${previousResponseSnippet.slice(0, 1400)}`;
}

export function zodErrorsToList(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function buildCoverLetterRepairPrompt(
  errors: { path: string; message: string }[],
  previousResponseSnippet: string,
): string {
  const errorLines = errors
    .map((e) => `- ${e.path || "root"}: ${e.message}`)
    .join("\n");

  return `Your cover letter JSON failed validation:
${errorLines}

Please regenerate returning ONLY valid JSON with these sections:
- opening_hook, why_this_role, evidence_points (2-3 items), why_this_company, cta, body.
- Do NOT put a greeting (Dear ...) or sign-off (Warm regards / Best regards / name) in opening_hook, cta, or any section - the Google Doc template already has greeting and sign-off. opening_hook must start with your hook sentence. cta is a polite close only (no regards line).
- evidence_points must each cite tailored resume bullets with quantified metrics (%, $, scale, years, user counts) copied exactly from the resume - at least two metrics total across evidence_points.
- The body field is optional reference text without greeting/sign-off. Section fields must not duplicate them.
- The body must mention the target company by name.
- No placeholders like [COMPANY] or {{name}}.

Previous response:
${previousResponseSnippet.slice(0, 1200)}`;
}
