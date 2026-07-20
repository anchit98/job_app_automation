import { z } from "zod";
import { findPlaceholders } from "@/lib/emails/validate";

export const followUpEmailSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body_md: z.string().trim().min(30).max(6000),
});

export type FollowUpEmailContent = z.infer<typeof followUpEmailSchema>;

export function validateFollowUpContent(content: FollowUpEmailContent): {
  ok: boolean;
  issues: { path: string; message: string }[];
} {
  const issues: { path: string; message: string }[] = [];
  const placeholders = [
    ...findPlaceholders(content.subject),
    ...findPlaceholders(content.body_md),
  ];
  if (placeholders.length > 0) {
    issues.push({
      path: "body_md",
      message: `Unresolved placeholders: ${placeholders.join(", ")}`,
    });
  }
  return { ok: issues.length === 0, issues };
}

export function buildFollowUpRepairPrompt(
  errors: { path: string; message: string }[],
  previousResponse: string,
): string {
  const lines = errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
  return `Your follow-up email JSON failed validation:
${lines}

Return ONLY valid JSON: {"subject":"...","body_md":"..."}

Previous response:
${previousResponse.slice(0, 1200)}`;
}
