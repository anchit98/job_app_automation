"use server";

import {
  generateExtensionToken,
  getActiveExtensionTokenRow,
  revokeExtensionToken,
  upsertExtensionToken,
} from "@/lib/extension/tokens";
import {
  armExtensionWake,
  upsertPendingExtensionRun,
} from "@/lib/db/pipeline";
import { writeAuditLog } from "@/lib/audit";

export async function getExtensionTokenStatus() {
  const row = await getActiveExtensionTokenRow();
  return {
    configured: Boolean(row),
    token_prefix: row?.token_prefix ?? null,
    created_at: row?.created_at ?? null,
  };
}

/**
 * Ensure a token exists for JobApp Bridge. Returns plaintext only when newly created.
 */
export async function ensureExtensionToken() {
  const existing = await getActiveExtensionTokenRow();
  if (existing) {
    return {
      ok: true as const,
      created: false as const,
      configured: true as const,
      token_prefix: existing.token_prefix,
      token: null as string | null,
    };
  }

  const generated = generateExtensionToken();
  await upsertExtensionToken({
    token_hash: generated.token_hash,
    token_prefix: generated.token_prefix,
  });
  await writeAuditLog("extension.token_auto_created", "extension_tokens", "session");
  return {
    ok: true as const,
    created: true as const,
    configured: true as const,
    token_prefix: generated.token_prefix,
    token: generated.token,
  };
}

/** Generate a new token. Plaintext is shown once — store it in the extension. */
export async function rotateExtensionToken() {
  const generated = generateExtensionToken();
  await upsertExtensionToken({
    token_hash: generated.token_hash,
    token_prefix: generated.token_prefix,
  });
  await writeAuditLog("extension.token_rotated", "extension_tokens", "session");
  return {
    ok: true as const,
    token: generated.token,
    token_prefix: generated.token_prefix,
  };
}

export async function revokeExtensionTokenAction() {
  await revokeExtensionToken();
  await writeAuditLog("extension.token_revoked", "extension_tokens", "session");
  return { ok: true as const };
}

export type ArmExtensionPayload = {
  pipeline_run_id?: string;
  kind?: string;
  prompt_text?: string;
  chatgpt_url?: string;
};

/** Arm ChatGPT open for one prompt run (called only from Quick Apply / pipeline wake). */
export async function armExtensionForPromptRun(
  promptRunId: string,
  payload?: ArmExtensionPayload,
) {
  if (!promptRunId.trim()) {
    return { ok: false as const, error: "Missing prompt run id." };
  }
  const id = promptRunId.trim();

  let armed = await armExtensionWake(id, 300);
  // Pending row may be missing/completed after a prior stage — re-queue from stage payload.
  if (
    !armed &&
    payload?.pipeline_run_id &&
    payload.kind &&
    payload.prompt_text
  ) {
    await upsertPendingExtensionRun({
      prompt_run_id: id,
      pipeline_run_id: payload.pipeline_run_id,
      kind: payload.kind,
      prompt_text: payload.prompt_text,
      chatgpt_url: payload.chatgpt_url || "https://chatgpt.com/",
    });
    armed = await armExtensionWake(id, 300);
  }

  if (!armed) {
    return {
      ok: false as const,
      error: "No pending extension run to arm. Advance the pipeline first.",
    };
  }
  return { ok: true as const };
}
