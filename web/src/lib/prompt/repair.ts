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
 * into a short instruction with a word delta so ChatGPT can act without counting.
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
- Surgical edits only - do not rewrite bullets; swap/insert keywords or trim words if over the ceiling.
- Skills: keep "Category:" prefix exact; remove items after the colon until under the word ceiling.
- Total across ALL experience bullets + project bullets + skills: at most 400 words (shorter OK).
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
- Do NOT put a greeting (Dear ...) or sign-off in opening_hook or any section - the app inserts those from the Google Doc template. opening_hook must start with your hook sentence.
- evidence_points must each cite tailored resume bullets with quantified metrics (%, $, scale, years, user counts) copied exactly from the resume - at least two metrics total across evidence_points.
- The body field may include greeting + sign-off for reference, but section fields must not duplicate them.
- The body must mention the target company by name.
- No placeholders like [COMPANY] or {{name}}.

Previous response:
${previousResponseSnippet.slice(0, 1200)}`;
}
