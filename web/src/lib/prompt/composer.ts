import type { PromptTemplate } from "@/lib/db/types";
import { appendPromptRunMarker } from "@/lib/prompt/json-extract";
import {
  shouldUseChatGptKickoff,
  withChatGptKickoff,
} from "@/lib/prompt/chatgpt-kickoff";

export function interpolateTemplate(
  body: string,
  variables: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in variables) {
      return variables[key];
    }
    // Leave unknown placeholders untouched (e.g. {{name}} mentioned as a bad example in instructions).
    return match;
  });
}

export function composePrompt(
  template: PromptTemplate,
  variables: Record<string, string>,
  promptRunId: string,
): string {
  const rendered = interpolateTemplate(template.body, variables);
  const body = shouldUseChatGptKickoff(template.kind)
    ? withChatGptKickoff(rendered, template.kind)
    : rendered;
  return appendPromptRunMarker(body, promptRunId);
}

export function estimatePromptChars(text: string): number {
  return text.length;
}

export function warnIfPromptTooLong(text: string, limit = 30_000): string | null {
  if (text.length > limit) {
    return `Prompt is ~${text.length.toLocaleString()} characters (recommended max ${limit.toLocaleString()}). Consider condensing inputs.`;
  }
  return null;
}
