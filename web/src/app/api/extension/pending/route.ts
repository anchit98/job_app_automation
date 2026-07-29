import { NextResponse } from "next/server";
import {
  claimPendingExtensionRun,
  completePendingExtensionRun,
  consumeExtensionWake,
  getPendingExtensionRun,
  reclaimPendingExtensionRun,
} from "@/lib/db/pipeline";
import { dbGet } from "@/lib/db";
import { getPromptRunById } from "@/lib/db/queries";
import { runAsUser } from "@/lib/auth/request-user";
import { verifyExtensionBearer } from "@/lib/extension/tokens";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function promptOwnedByUser(
  promptRunId: string,
  userId: string,
): Promise<boolean> {
  const row = (await dbGet(
    `SELECT user_id FROM prompt_runs WHERE id = ?`,
    promptRunId,
  )) as { user_id: string | null } | undefined;
  return Boolean(row?.user_id && row.user_id === userId);
}

/**
 * Legacy poll endpoint. Always returns null so older extension builds that
 * poll on refresh / tab focus cannot open AI.
 */
export async function GET(request: Request) {
  if (!(await verifyExtensionBearer(request.headers.get("authorization")))) {
    return unauthorized();
  }
  return NextResponse.json({ pending: null });
}

/** Extension claims / consumes an explicit wake from Quick Apply. */
export async function POST(request: Request) {
  const auth = await verifyExtensionBearer(
    request.headers.get("authorization"),
  );
  if (!auth) {
    return unauthorized();
  }

  let body: { prompt_run_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return runAsUser(auth.userId, async () => {
    if (body.action === "consume_wake" && body.prompt_run_id) {
      if (!(await promptOwnedByUser(body.prompt_run_id, auth.userId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const armed = await consumeExtensionWake(body.prompt_run_id);
      if (!armed) {
        return NextResponse.json({
          ok: false,
          armed: false,
          error: "No active wake - open AI only from Quick Apply.",
        });
      }
      const run = await getPromptRunById(body.prompt_run_id);
      if (!run || run.status !== "pending") {
        await completePendingExtensionRun(body.prompt_run_id, "completed");
        return NextResponse.json({
          ok: false,
          armed: false,
          error: "Prompt run is no longer pending.",
        });
      }
      return NextResponse.json({ ok: true, armed: true, pending: armed });
    }

    if (body.action === "claim" && body.prompt_run_id) {
      if (!(await promptOwnedByUser(body.prompt_run_id, auth.userId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const pending = await getPendingExtensionRun(body.prompt_run_id);
      if (pending?.status === "claimed") {
        return NextResponse.json({ ok: true, already_claimed: true });
      }
      const claimed = await claimPendingExtensionRun(body.prompt_run_id);
      return NextResponse.json({ ok: claimed });
    }

    if (body.action === "requeue" && body.prompt_run_id) {
      if (!(await promptOwnedByUser(body.prompt_run_id, auth.userId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await reclaimPendingExtensionRun(body.prompt_run_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
