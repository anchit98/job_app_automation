import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/status";

export type AutoStatusEvent =
  | "jd_parsed"
  | "resume_ready"
  | "cover_letter_ready"
  | "gmail_draft_created";

const PIPELINE: ApplicationStatus[] = [
  "draft",
  "ready",
  "applied",
  "email_sent",
  "hr_replied",
  "interview_scheduled",
  "offer",
  "accepted",
];

export function statusRank(status: ApplicationStatus): number {
  const idx = PIPELINE.indexOf(status);
  if (idx >= 0) return idx;
  if (status === "rejected") return 90;
  if (status === "withdrawn") return 91;
  return -1;
}

export interface StatusAdvancePlan {
  suggested: ApplicationStatus;
  mode: "auto" | "confirm";
  message: string;
}

export function planStatusAdvance(
  current: ApplicationStatus,
  event: AutoStatusEvent,
): StatusAdvancePlan | null {
  const rank = statusRank(current);
  if (rank < 0) return null;

  switch (event) {
    case "jd_parsed":
      if (current === "draft") {
        return {
          suggested: "ready",
          mode: "auto",
          message: "",
        };
      }
      return null;

    case "resume_ready":
      if (current === "draft") {
        return {
          suggested: "ready",
          mode: "auto",
          message: "",
        };
      }
      if (current === "ready") {
        // Quick Apply: package is progressing - stay ready until outreach drafts exist.
        return null;
      }
      return null;

    case "cover_letter_ready":
      if (current === "draft") {
        return {
          suggested: "ready",
          mode: "auto",
          message: "",
        };
      }
      return null;

    case "gmail_draft_created":
      // Step through applied → email_sent via maybeAdvanceApplicationStatus chaining.
      if (rank < statusRank("applied")) {
        return {
          suggested: "applied",
          mode: "auto",
          message: "",
        };
      }
      if (rank < statusRank("email_sent")) {
        return {
          suggested: "email_sent",
          mode: "auto",
          message: "",
        };
      }
      return null;

    default:
      return null;
  }
}

export function planManualStatusChange(
  current: ApplicationStatus,
  next: ApplicationStatus,
): { mode: "allow" } | { mode: "confirm"; message: string } {
  if (current === next) return { mode: "allow" };

  const currentRank = statusRank(current);
  const nextRank = statusRank(next);

  if (next === "rejected" || next === "withdrawn") {
    return {
      mode: "confirm",
      message: `Mark this application as ${APPLICATION_STATUS_LABELS[next]}?`,
    };
  }

  if (currentRank >= 0 && nextRank >= 0 && nextRank < currentRank) {
    return {
      mode: "confirm",
      message: `Move status back to ${APPLICATION_STATUS_LABELS[next]}?`,
    };
  }

  if (currentRank >= 0 && nextRank >= 0 && nextRank - currentRank > 1) {
    return {
      mode: "confirm",
      message: `Skip ahead to ${APPLICATION_STATUS_LABELS[next]}?`,
    };
  }

  if ((current === "rejected" || current === "withdrawn") && nextRank >= 0) {
    return {
      mode: "confirm",
      message: `Reopen this application as ${APPLICATION_STATUS_LABELS[next]}?`,
    };
  }

  return { mode: "allow" };
}

export type StatusAdvanceOutcome =
  | { outcome: "advanced"; new_status: ApplicationStatus }
  | {
      outcome: "needs_confirmation";
      suggested_status: ApplicationStatus;
      message: string;
      event: AutoStatusEvent;
    }
  | { outcome: "skipped" }
  | { outcome: "error"; error: string };
