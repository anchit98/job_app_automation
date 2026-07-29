/**
 * Extract the first JSON object or array from a ChatGPT response.
 * Handles markdown code fences and leading/trailing prose.
 */
export function extractJsonFromText(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  let start = -1;
  if (objectStart === -1) start = arrayStart;
  else if (arrayStart === -1) start = objectStart;
  else start = Math.min(objectStart, arrayStart);

  if (start === -1) {
    throw new Error("No JSON object or array found in response");
  }

  const slice = text.slice(start);
  const balanced = takeBalancedJson(slice);
  if (balanced.length < slice.length - 2) {
    throw new Error(
      "JSON appears truncated - response was cut off before the end. In ChatGPT, ask it to output the COMPLETE JSON in one message, then paste again.",
    );
  }
  return balanced;
}

function takeBalancedJson(text: string): string {
  const open = text[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(0, i + 1);
      }
    }
  }

  throw new Error("Unbalanced JSON in response");
}

/**
 * ChatGPT often escapes markdown as \[link\] inside JSON strings.
 * Only \", \\, \/, \b, \f, \n, \r, \t, and \uXXXX are valid JSON escapes.
 */
export function sanitizeInvalidJsonEscapes(json: string): string {
  let result = "";
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (ch !== "\\" || i + 1 >= json.length) {
      result += ch;
      continue;
    }
    const next = json[i + 1];
    if (
      next === '"' ||
      next === "\\" ||
      next === "/" ||
      next === "b" ||
      next === "f" ||
      next === "n" ||
      next === "r" ||
      next === "t"
    ) {
      result += ch + next;
      i++;
      continue;
    }
    if (next === "u" && i + 5 < json.length) {
      const hex = json.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        result += json.slice(i, i + 6);
        i += 5;
        continue;
      }
    }
    // Invalid escape (e.g. \[ or \]) - drop the backslash
    result += next;
    i++;
  }
  return result;
}

export function parseExtractedJson(text: string): unknown {
  const sanitized = sanitizeInvalidJsonEscapes(text);
  return JSON.parse(sanitized);
}

export const PROMPT_RUN_MARKER_PREFIX = "<!-- prompt_run_id:";

export function appendPromptRunMarker(prompt: string, promptRunId: string): string {
  return `${prompt}\n\n${PROMPT_RUN_MARKER_PREFIX} ${promptRunId} -->`;
}

export function parsePromptRunMarker(raw: string): string | null {
  const match = raw.match(/<!--\s*prompt_run_id:\s*([a-f0-9-]+)\s*-->/i);
  return match?.[1] ?? null;
}
