"use server";

import {
  generateExtensionToken,
  getActiveExtensionTokenRow,
  revokeExtensionToken,
  upsertExtensionToken,
} from "@/lib/extension/tokens";
import { armExtensionWake } from "@/lib/db/pipeline";
import { writeAuditLog } from "@/lib/audit";

export async function getExtensionTokenStatus() {
  const row = getActiveExtensionTokenRow();
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
  const existing = getActiveExtensionTokenRow();
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
  upsertExtensionToken({
    token_hash: generated.token_hash,
    token_prefix: generated.token_prefix,
  });
  await writeAuditLog("extension.token_auto_created", "extension_tokens", "1");
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
  upsertExtensionToken({
    token_hash: generated.token_hash,
    token_prefix: generated.token_prefix,
  });
  await writeAuditLog("extension.token_rotated", "extension_tokens", "1");
  return {
    ok: true as const,
    token: generated.token,
    token_prefix: generated.token_prefix,
  };
}

export async function revokeExtensionTokenAction() {
  revokeExtensionToken();
  await writeAuditLog("extension.token_revoked", "extension_tokens", "1");
  return { ok: true as const };
}

/** Arm ChatGPT open for one prompt run (called only from Quick Apply / pipeline wake). */
export async function armExtensionForPromptRun(promptRunId: string) {
  if (!promptRunId.trim()) {
    return { ok: false as const, error: "Missing prompt run id." };
  }
  const armed = armExtensionWake(promptRunId.trim(), 300);
  if (!armed) {
    return {
      ok: false as const,
      error: "No pending extension run to arm. Advance the pipeline first.",
    };
  }
  return { ok: true as const };
}
