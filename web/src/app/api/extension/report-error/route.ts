import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { dbGet } from "@/lib/db";
import {
  completePendingExtensionRun,
  reclaimPendingExtensionRun,
} from "@/lib/db/pipeline";
import { runAsUser } from "@/lib/auth/request-user";
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
  const auth = await verifyExtensionBearer(
    request.headers.get("authorization"),
  );
  if (!auth) {
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

  return runAsUser(auth.userId, async () => {
    if (body.prompt_run_id) {
      const row = (await dbGet(
        `SELECT user_id FROM prompt_runs WHERE id = ?`,
        body.prompt_run_id,
      )) as { user_id: string | null } | undefined;
      if (!row?.user_id || row.user_id !== auth.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const permanent = isPermanentExtensionFailure(body.message);

    if (body.prompt_run_id) {
      if (permanent) {
        await completePendingExtensionRun(
          body.prompt_run_id,
          "failed",
          body.message ?? "permanent failure",
        );
      } else {
        await reclaimPendingExtensionRun(body.prompt_run_id);
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
  });
}
