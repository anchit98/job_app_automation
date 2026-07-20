import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import {
  completePendingExtensionRun,
  reclaimPendingExtensionRun,
} from "@/lib/db/pipeline";
import { verifyExtensionBearer } from "@/lib/extension/tokens";
import { isGoogleReconnectError } from "@/lib/google/reconnect";

function isPermanentExtensionFailure(message?: string | null): boolean {
  if (!message) return false;
  if (isGoogleReconnectError(message)) return true;
  return /file export failed|upload_failed|schema validation|repair prompt|empty chatgpt response/i.test(
    message,
  );
}

/** Extension reports DOM/selector failures for maintenance. */
export async function POST(request: Request) {
  if (!await verifyExtensionBearer(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    prompt_run_id?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const permanent = isPermanentExtensionFailure(body.message);

  if (body.prompt_run_id) {
    if (permanent) {
      // Keep failed — Google / validation issues must not silently re-open ChatGPT.
      completePendingExtensionRun(
        body.prompt_run_id,
        "failed",
        body.message ?? "permanent failure",
      );
    } else {
      // Transient DOM/selector failures — allow a later wake to retry.
      reclaimPendingExtensionRun(body.prompt_run_id);
    }
  }

  await writeAuditLog(
    "extension.error",
    "extension",
    body.prompt_run_id ?? "unknown",
    {
      message: body.message ?? null,
      details: body.details ?? null,
      permanent,
    },
  );

  return NextResponse.json({ ok: true, permanent });
}
