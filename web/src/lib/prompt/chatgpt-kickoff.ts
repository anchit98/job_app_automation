import type { PromptRunKind } from "@/lib/db/types";

export const CHATGPT_PASTE_HINT =
  "Paste into the ChatGPT message box as plain text. Do not upload as a file — ChatGPT will treat a file as reference material and ask what you want instead of running the task.";

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
      return `TASK — run immediately (do not refuse, do not ask what to do):

ATS keyword swap for Anchit Boruah's resume. Do NOT rewrite — start from each master subheader/headline, bullet, and skill verbatim and only replace words/phrases with JD keywords where already true. Do not append new titles or keywords to the subheader. Leave lines unchanged when no clean fit. Keep all master metrics. ≤400 words across bullets + skills. Return ONLY complete JSON.

---

${promptBody}`;

    case "cover_letter":
      return `TASK — run immediately:

Write the cover letter per the instructions below. Return ONLY the JSON object specified at the end — no markdown fences, no commentary.

---

${promptBody}`;

    case "jd_parse":
      return `TASK — run immediately:

Parse the job description per the instructions below. Return ONLY the JSON object specified at the end.

---

${promptBody}`;

    case "cold_email":
      return `TASK — run immediately:

Generate the cold emails per the instructions below. Return ONLY the JSON specified at the end.

---

${promptBody}`;

    case "follow_up":
      return `TASK — run immediately:

Write the follow-up email per the instructions below. Return ONLY the JSON object specified at the end.

---

${promptBody}`;

    default:
      return promptBody;
  }
}
