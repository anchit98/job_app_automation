/**
 * Resend, over plain `fetch`.
 *
 * No SDK: the whole API surface this app needs is one POST, and a dependency
 * that exists to build one JSON body is a dependency that also has to be kept
 * up to date and bundled into every serverless function.
 *
 * Errors come back as values rather than exceptions, because the caller
 * (`lib/emails/transactional`) promises never to throw — a provider outage must
 * not roll back the password token or the payment that was already recorded.
 */
import { env } from "@/lib/env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Requests are cheap to retry and expensive to hang on. */
const SEND_TIMEOUT_MS = 10_000;

export interface ResendSendInput {
  to: string[];
  subject: string;
  bodyHtml: string;
}

export type ResendSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * Pull a usable message out of whatever Resend returned.
 *
 * The API answers errors as JSON, but a gateway in front of it answers with
 * HTML, and `response.json()` on that throws something that reads like a
 * parser bug rather than an outage.
 */
async function describeFailure(response: Response): Promise<string> {
  const fallback = `Resend rejected the send (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as { message?: string; name?: string };
    const message = body?.message?.trim();
    return message ? `Resend: ${message}` : fallback;
  } catch {
    return fallback;
  }
}

export async function sendViaResend(
  input: ResendSendInput,
): Promise<ResendSendResult> {
  const apiKey = env.resendApiKey();
  const from = env.transactionalFromEmail();
  if (!apiKey || !from) {
    return { ok: false, error: "Resend is not configured." };
  }
  if (input.to.length === 0) {
    return { ok: false, error: "No recipients." };
  }

  const replyTo = env.transactionalReplyTo().trim();

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.bodyHtml,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, error: await describeFailure(response) };
    }

    const body = (await response.json().catch(() => null)) as {
      id?: string;
    } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut
        ? "Resend did not respond in time."
        : error instanceof Error
          ? error.message
          : "Could not reach Resend.",
    };
  }
}
