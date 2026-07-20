import Link from "next/link";
import { notFound } from "next/navigation";
import { getPipelineRunById } from "@/lib/db/pipeline";
import { getApplicationById } from "@/lib/db/queries";
import { PipelineProgress } from "@/components/pipeline/pipeline-progress";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pipeline = getPipelineRunById(id);
  if (!pipeline) notFound();
  const application = getApplicationById(pipeline.application_id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/apply"
            className="li-meta inline-flex items-center gap-1 hover:text-primary no-underline"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            New Quick Apply
          </Link>
          <h1 className="li-page-title mt-1">Pipeline</h1>
          {application?.company || application?.role ? (
            <p className="text-[14px] text-on-surface-variant mt-1">
              {[application.company, application.role].filter(Boolean).join(" — ")}
            </p>
          ) : null}
        </div>
      </div>
      <PipelineProgress
        initialPipeline={pipeline}
        initialApplicationStatus={application?.status ?? null}
      />
    </div>
  );
}
