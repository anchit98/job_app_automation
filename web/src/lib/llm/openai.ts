import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const OPENAI_MODEL_ID = "gpt-4.1-mini";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT =
  "You are a careful assistant for job-application automation. Return ONLY valid JSON matching the user's schema. No markdown fences, no preamble, no reasoning outside JSON.";

export type OpenAiStageKind =
  | "jd_parse"
  | "resume"
  | "cover_letter"
  | "cold_email"
  | string;

const MAX_TOKENS_BY_KIND: Record<string, number> = {
  jd_parse: 3072,
  resume: 8192,
  cover_letter: 4096,
  cold_email: 4096,
  master_resume_sync: 8192,
};

const CURL_MAX_TIME_BY_KIND: Record<string, number> = {
  jd_parse: 90,
  resume: 180,
  cover_letter: 150,
  cold_email: 120,
  master_resume_sync: 180,
};
const DEFAULT_CURL_MAX_TIME_SEC = 120;

const MAX_ATTEMPTS = 2;
const BACKOFF_MS = [2_000, 4_000];

let openaiGate: Promise<void> = Promise.resolve();

function withOpenAiGate<T>(fn: () => Promise<T>): Promise<T> {
  const next = openaiGate.then(fn, fn);
  openaiGate = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function openaiApiKey(): string {
  const key =
    process.env.CHATGPT_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "CHATGPT_API_KEY is not set. Add it to web/.env.local for Apply.",
    );
  }
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[^\s"']+/g, "[REDACTED]");
}

function timeoutSecForKind(kind?: string): number {
  return CURL_MAX_TIME_BY_KIND[kind ?? ""] ?? DEFAULT_CURL_MAX_TIME_SEC;
}

function buildBody(prompt: string, maxTokens: number) {
  return {
    model: OPENAI_MODEL_ID,
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  };
}

function extractContent(api: unknown): string {
  const content = (
    api as {
      choices?: Array<{ message?: { content?: string } }>;
    }
  )?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}

async function callViaFetch(
  prompt: string,
  maxTokens: number,
  timeoutSec: number,
): Promise<string> {
  const key = openaiApiKey();
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(prompt, maxTokens)),
    signal: AbortSignal.timeout(timeoutSec * 1000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI API HTTP ${res.status}: ${text.slice(0, 280)}`);
  }
  return extractContent(JSON.parse(text));
}

async function callViaCurl(
  prompt: string,
  maxTokens: number,
  timeoutSec: number,
): Promise<string> {
  const key = openaiApiKey();
  const tmp = os.tmpdir();
  const tag = randomUUID().slice(0, 8);
  const reqPath = path.join(tmp, `jobapp-openai-${tag}.req.json`);
  const resPath = path.join(tmp, `jobapp-openai-${tag}.api.json`);
  fs.writeFileSync(reqPath, JSON.stringify(buildBody(prompt, maxTokens)), "utf8");

  try {
    const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
    const { stdout } = await execFileAsync(
      curlBin,
      [
        "-sS",
        "-m",
        String(timeoutSec),
        "-w",
        "\n__CURL_HTTP__:%{http_code}",
        OPENAI_CHAT_URL,
        "-H",
        `Authorization: Bearer ${key}`,
        "-H",
        "Content-Type: application/json",
        "--data-binary",
        `@${reqPath}`,
        "-o",
        resPath,
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: (timeoutSec + 15) * 1000,
      },
    );
    const httpMatch = stdout.match(/__CURL_HTTP__:(\d+)/);
    const httpStatus = httpMatch ? Number(httpMatch[1]) : 0;
    if (!fs.existsSync(resPath)) {
      throw new Error(`OpenAI curl failed (HTTP ${httpStatus || "unknown"}).`);
    }
    const raw = fs.readFileSync(resPath, "utf8");
    if (httpStatus !== 200) {
      throw new Error(`OpenAI API HTTP ${httpStatus}: ${raw.slice(0, 280)}`);
    }
    return extractContent(JSON.parse(raw));
  } finally {
    try {
      fs.unlinkSync(reqPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(resPath);
    } catch {
      /* ignore */
    }
  }
}

async function callOnce(
  prompt: string,
  maxTokens: number,
  timeoutSec: number,
): Promise<string> {
  if (process.platform === "win32") {
    return callViaCurl(prompt, maxTokens, timeoutSec);
  }
  try {
    return await callViaFetch(prompt, maxTokens, timeoutSec);
  } catch (err) {
    console.warn(
      "[openai] fetch failed, retrying via curl:",
      redact(err instanceof Error ? err.message : String(err)),
    );
    return callViaCurl(prompt, maxTokens, timeoutSec);
  }
}

export type OpenAiGenerateResult = {
  content: string;
  attempts: number;
  latencyMs: number;
};

export function friendlyOpenAiApiError(raw: string): string {
  if (
    /timeout|timed out|max-time|abort|ETIMEDOUT|ECONNRESET|fetch failed|network|curl/i.test(
      raw,
    )
  ) {
    return "This took too long. Please retry.";
  }
  if (/rate limit|429|quota|insufficient_quota|too many/i.test(raw)) {
    return "The service is busy. Retry in a minute.";
  }
  if (/HTTP 401|invalid.?api.?key|incorrect api key/i.test(raw)) {
    return "OpenAI API key is invalid. Check web/.env.local.";
  }
  if (/HTTP 5\d\d|internal.server.error/i.test(raw)) {
    return "The AI service had a temporary error. Please retry.";
  }
  return "This step failed. Please retry.";
}

/** Call OpenAI gpt-4.1-mini with tight retries. Returns model message content. */
export async function generateWithOpenAI(input: {
  prompt: string;
  kind?: OpenAiStageKind;
  maxTokens?: number;
  onAttempt?: (info: {
    attempt: number;
    maxAttempts: number;
  }) => void | Promise<void>;
}): Promise<OpenAiGenerateResult> {
  return withOpenAiGate(async () => {
    const maxTokens =
      input.maxTokens ?? MAX_TOKENS_BY_KIND[input.kind ?? ""] ?? 4096;
    const timeoutSec = timeoutSecForKind(input.kind);
    let lastError = "OpenAI LLM call failed.";
    const started = Date.now();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const attemptStarted = Date.now();
      try {
        await input.onAttempt?.({ attempt, maxAttempts: MAX_ATTEMPTS });
        const content = await callOnce(input.prompt, maxTokens, timeoutSec);
        const latencyMs = Date.now() - started;
        console.info(
          `[openai] ${OPENAI_MODEL_ID} ${input.kind ?? "?"} ok attempt ${attempt}/${MAX_ATTEMPTS} in ${Math.round((Date.now() - attemptStarted) / 1000)}s (total ${Math.round(latencyMs / 1000)}s)`,
        );
        return { content, attempts: attempt, latencyMs };
      } catch (err) {
        lastError = redact(err instanceof Error ? err.message : String(err));
        console.warn(
          `[openai] ${OPENAI_MODEL_ID} ${input.kind ?? "?"} attempt ${attempt}/${MAX_ATTEMPTS} failed in ${Math.round((Date.now() - attemptStarted) / 1000)}s:`,
          lastError.slice(0, 200),
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS[attempt - 1] ?? 4_000);
        }
      }
    }

    throw new Error(lastError);
  });
}

export function maxTokensForStage(kind: string): number {
  return MAX_TOKENS_BY_KIND[kind] ?? 4096;
}
