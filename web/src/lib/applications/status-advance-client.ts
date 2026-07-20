import { confirmStatusAdvance } from "@/app/actions/applications";
import type { StatusAdvanceOutcome } from "@/lib/applications/auto-status";
import type { ApplicationStatus } from "@/lib/applications/status";

export async function resolveStatusAdvance(
  applicationId: string,
  advance: StatusAdvanceOutcome | undefined,
  router: { refresh: () => void },
): Promise<void> {
  if (!advance) return;

  if (advance.outcome === "advanced") {
    router.refresh();
    return;
  }

  if (advance.outcome === "needs_confirmation") {
    const label = advance.suggested_status.replace(/_/g, " ");
    const ok = window.confirm(
      advance.message ||
        `Update application status to "${label}"?`,
    );
    if (!ok) return;

    const result = await confirmStatusAdvance(
      applicationId,
      advance.suggested_status,
    );
    if (result.ok) router.refresh();
  }
}

export function confirmManualStatusChange(
  current: ApplicationStatus,
  next: ApplicationStatus,
  message: string,
): boolean {
  return window.confirm(message);
}
