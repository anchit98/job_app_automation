import { NextResponse } from "next/server";
import {
  claimPendingExtensionRun,
  completePendingExtensionRun,
  consumeExtensionWake,
  getPendingExtensionRun,
  reclaimPendingExtensionRun,
} from "@/lib/db/pipeline";
import { getPromptRunById } from "@/lib/db/queries";
import { verifyExtensionBearer } from "@/lib/extension/tokens";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Legacy poll endpoint. Always returns null so older extension builds that
 * poll on refresh / tab focus cannot open ChatGPT.
 */
export async function GET(request: Request) {
  if (!verifyExtensionBearer(request.headers.get("authorization"))) {
    return unauthorized();
  }
  return NextResponse.json({ pending: null });
}

/** Extension claims / consumes an explicit wake from Quick Apply. */
export async function POST(request: Request) {
  if (!verifyExtensionBearer(request.headers.get("authorization"))) {
    return unauthorized();
  }

  let body: { prompt_run_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "consume_wake" && body.prompt_run_id) {
    const armed = consumeExtensionWake(body.prompt_run_id);
    if (!armed) {
      return NextResponse.json({
        ok: false,
        armed: false,
        error: "No active wake — open ChatGPT only from Quick Apply.",
      });
    }
    const run = getPromptRunById(body.prompt_run_id);
    if (!run || run.status !== "pending") {
      completePendingExtensionRun(body.prompt_run_id, "completed");
      return NextResponse.json({
        ok: false,
        armed: false,
        error: "Prompt run is no longer pending.",
      });
    }
    return NextResponse.json({ ok: true, armed: true, pending: armed });
  }

  if (body.action === "claim" && body.prompt_run_id) {
    const pending = getPendingExtensionRun(body.prompt_run_id);
    if (pending?.status === "claimed") {
      return NextResponse.json({ ok: true, already_claimed: true });
    }
    const claimed = claimPendingExtensionRun(body.prompt_run_id);
    return NextResponse.json({ ok: claimed });
  }

  if (body.action === "requeue" && body.prompt_run_id) {
    reclaimPendingExtensionRun(body.prompt_run_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
