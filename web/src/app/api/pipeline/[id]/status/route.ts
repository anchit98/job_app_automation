import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getPipelineRunById } from "@/lib/db/pipeline";
import {
  getApplicationById,
  getLatestReadyCoverLetterVersion,
  getLatestReadyResumeVersion,
} from "@/lib/db/queries";
import { loadPipelineOutreach } from "@/lib/pipeline/outreach";

export const dynamic = "force-dynamic";

/**
 * Lightweight status poll that is not blocked by long-running server actions
 * (advancePipeline / OpenAI generation). Used so progress icons update live.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const run = await getPipelineRunById(id, user.id);
  if (!run) {
    return NextResponse.json(
      { ok: false, error: "Pipeline not found." },
      { status: 404 },
    );
  }

  // Four independent reads at ~200ms each on the pooler. Run together they
  // cost one round trip instead of four — and this route is polled every
  // couple of seconds for the whole length of a run.
  const [application, resume, coverLetter] = await Promise.all([
    getApplicationById(run.application_id),
    getLatestReadyResumeVersion(run.application_id),
    getLatestReadyCoverLetterVersion(run.application_id),
  ]);

  // Only once the run is done. This poll fires every couple of seconds, and
  // the emails are several KB each — no reason to ship them on every tick of a
  // pipeline that has not written them yet.
  const outreach =
    run.status === "completed"
      ? await loadPipelineOutreach(run.application_id).catch(() => null)
      : null;

  return NextResponse.json({
    ok: true,
    pipeline: run,
    application_status: application?.status ?? null,
    company: application?.company ?? null,
    role: application?.role ?? null,
    downloads: {
      resume_version: resume?.version ?? null,
      cover_letter_version: coverLetter?.version ?? null,
    },
    outreach,
  });
}
