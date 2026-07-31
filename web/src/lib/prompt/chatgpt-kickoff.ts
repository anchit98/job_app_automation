import type { PromptRunKind } from "@/lib/db/types";

export const CHATGPT_PASTE_HINT =
  "Paste into the AI message box as plain text. Do not upload as a file - AI will treat a file as reference material and ask what you want instead of running the task.";

const KICKOFF_KINDS: PromptRunKind[] = [
  "resume",
  "cover_letter",
  "jd_parse",
  "cold_email",
  "follow_up",
];

export function shouldUseChatGptKickoff(kind: string): kind is PromptRunKind {
  return (KICKOFF_KINDS as string[]).includes(kind);
}

export function withChatGptKickoff(
  promptBody: string,
  kind: string,
): string {
  if (!shouldUseChatGptKickoff(kind)) return promptBody;

  switch (kind) {
    case "resume":
      return `TASK - run immediately (do not refuse, do not ask what to do):

Tailor the user's master resume to the job description by REPLACING words with JD keywords in place. Do not add clauses or grow line length — one-page PDF is mandatory. Do not invent experience. Each output line must be ≤ the master line length. Same bullet/skill counts as master. Every bullet must be a complete finished sentence. Return ONLY complete JSON.

---

${promptBody}`;

    case "cover_letter":
      return `TASK - run immediately:

Write the cover letter per the instructions below. Do NOT include a greeting or sign-off (Warm regards / name) — the Google Doc template already has both. Maximize grounded JD keywords while staying concise. Return ONLY the JSON object specified at the end - no markdown fences, no commentary.

---

${promptBody}`;

    case "jd_parse":
      return `TASK - run immediately:

Parse the job description per the instructions below. Return ONLY the JSON object specified at the end.

---

${promptBody}`;

    case "cold_email":
      return `TASK - run immediately:

Generate short, structured cold emails per the instructions below. Showcase the candidate's best traits, skills, and achievements as bullet points. Return ONLY the JSON specified at the end.

---

${promptBody}`;

    case "follow_up":
      return `TASK - run immediately:

Write the follow-up email per the instructions below. Return ONLY the JSON object specified at the end.

---

${promptBody}`;

    default:
      return promptBody;
  }
}
