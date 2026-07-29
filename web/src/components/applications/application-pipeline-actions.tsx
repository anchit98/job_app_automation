"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resumePipeline } from "@/app/actions/pipeline";

function pipelineLabel(status: string, stage: string | null) {
  if (status === "queued") return "Queued";
  if (status === "failed" || status === "needs_manual") return "Failed";
  if (status === "awaiting_chatgpt") return `Waiting · ${stage ?? "AI"}`;
  if (status === "running") return `Running · ${stage ?? "…"}`;
  if (status === "completed") return "Done";
  return status;
}

export function ApplicationPipelineActions({
  pipelineId,
  status,
  currentStage,
  error,
  canResume,
  compact,
}: {
  pipelineId: string;
  status: string;
  currentStage: string | null;
  error: string | null;
  canResume: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status === "completed") {
    return (
      <Link
        href={`/pipeline/${pipelineId}`}
        className="text-[12px] text-on-surface-variant hover:text-primary no-underline"
        title="View pipeline"
      >
        Done
      </Link>
    );
  }

  const label = pipelineLabel(status, currentStage);
  const isFailed = status === "failed" || status === "needs_manual";
  const actionLabel = isFailed ? "Retry" : status === "queued" ? "Queued" : "Resume";

  return (
    <div className={`flex ${compact ? "flex-col items-end" : "items-center"} gap-1`}>
      <span
        className={`text-[11px] ${
          isFailed ? "text-error" : "text-on-surface-variant"
        }`}
        title={error ?? undefined}
      >
        {label}
      </span>
      <div className="flex items-center gap-1">
        {canResume && status !== "queued" && (
          <button
            type="button"
            disabled={pending}
            title={error ?? actionLabel}
            onClick={() => {
              startTransition(async () => {
                const result = await resumePipeline(pipelineId);
                if (!result.ok) {
                  window.alert(result.error ?? "Could not resume pipeline.");
                  return;
                }
                router.push(`/pipeline/${pipelineId}`);
                router.refresh();
              });
            }}
            className="li-btn-ghost text-[11px] px-2 py-1 border border-border-hairline disabled:opacity-50"
          >
            {pending ? "…" : actionLabel}
          </button>
        )}
        <Link
          href={`/pipeline/${pipelineId}`}
          className="li-btn-ghost text-[11px] px-2 py-1 border border-border-hairline no-underline"
        >
          Open
        </Link>
      </div>
    </div>
  );
}
