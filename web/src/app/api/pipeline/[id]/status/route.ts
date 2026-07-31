import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getPipelineRunById } from "@/lib/db/pipeline";
import {
  getApplicationById,
  getLatestReadyCoverLetterVersion,
  getLatestReadyResumeVersion,
} from "@/lib/db/queries";

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

  const application = await getApplicationById(run.application_id);
  const resume = await getLatestReadyResumeVersion(run.application_id);
  const coverLetter = await getLatestReadyCoverLetterVersion(run.application_id);

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
  });
}
