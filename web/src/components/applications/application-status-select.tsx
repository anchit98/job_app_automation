"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplicationStatus } from "@/app/actions/applications";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/status";
import { planManualStatusChange } from "@/lib/applications/auto-status";
import { Label } from "@/components/ui/label";

/** Statuses the system cannot infer — user sets these manually. */
const MANUAL_STATUSES: ApplicationStatus[] = [
  "hr_replied",
  "interview_scheduled",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

const PIPELINE_STATUSES: ApplicationStatus[] = [
  "draft",
  "ready",
  "applied",
  "email_sent",
];

interface ApplicationStatusSelectProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  variant?: "default" | "compact";
}

export function ApplicationStatusSelect({
  applicationId,
  currentStatus,
  variant = "default",
}: ApplicationStatusSelectProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  function handleChange(next: ApplicationStatus) {
    if (next === status) return;

    const plan = planManualStatusChange(status, next);
    if (plan.mode === "confirm" && !window.confirm(plan.message)) {
      return;
    }

    const previous = status;
    setError(null);
    setStatus(next);

    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, next);
      if (!result.ok) {
        setStatus(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const selectClass =
    variant === "compact"
      ? "rounded-full border border-outline-variant bg-surface-container-high px-3 py-1.5 text-[13px] font-medium text-on-surface disabled:opacity-50 cursor-pointer min-w-[148px]"
      : "w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 text-sm text-on-surface disabled:opacity-50 cursor-pointer";

  return (
    <div className={variant === "compact" ? "shrink-0" : "w-full"}>
      {variant === "default" && (
        <Label htmlFor={`status-${applicationId}`} className="text-[11px] text-on-surface-variant uppercase tracking-wider">
          Application status
        </Label>
      )}
      <select
        id={`status-${applicationId}`}
        aria-label="Application status"
        value={status}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as ApplicationStatus)}
        className={variant === "default" ? `mt-1 ${selectClass}` : selectClass}
      >
        <optgroup label="Pipeline (auto-updates as you work)">
          {PIPELINE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {APPLICATION_STATUS_LABELS[value]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Your update (set when you hear back)">
          {MANUAL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {APPLICATION_STATUS_LABELS[value]}
            </option>
          ))}
        </optgroup>
      </select>
      {variant === "default" && (
        <p className="mt-2 text-[12px] text-on-surface-variant leading-snug">
          Pipeline statuses advance when you parse the JD, generate documents, or
          create Gmail drafts. Use the second group when you get a reply, interview,
          offer, or outcome.
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-error">{error}</p>
      )}
    </div>
  );
}
