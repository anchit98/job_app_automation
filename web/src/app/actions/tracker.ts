"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { htmlToPlainText } from "@/lib/cover-letter/html";
import { getApplicationById } from "@/lib/db/queries";
import {
  formatRate,
  mapDashboardMetrics,
  type DashboardMetrics,
} from "@/lib/tracker/metrics";
import { runTrackerMaintenance } from "@/lib/tracker/maintenance";
import {
  deleteApplicationRow,
  findSimilarApplications,
  getDashboardMetricsRow,
  listApplicationTimeline,
  listPendingPromptRuns,
  searchApplications,
  updateApplicationNotesRow,
  type PendingPromptRunItem,
} from "@/lib/tracker/queries";
import {
  parseApplicationSearchParams,
  type ApplicationSearchFilters,
  type ApplicationSearchResult,
} from "@/lib/tracker/search";
import type { TimelineEvent } from "@/lib/tracker/timeline";
import type { Application } from "@/lib/db/types";

export async function getDashboardData(): Promise<{
  metrics: DashboardMetrics;
  metricsFormatted: {
    responseRate: string;
    interviewRate: string;
    offerRate: string;
  };
}> {
  runTrackerMaintenance();
  const row = getDashboardMetricsRow();
  const metrics = mapDashboardMetrics(row);
  return {
    metrics,
    metricsFormatted: {
      responseRate: formatRate(metrics.responseRate),
      interviewRate: formatRate(metrics.interviewRate),
      offerRate: formatRate(metrics.offerRate),
    },
  };
}

export async function searchApplicationsAction(
  filters: ApplicationSearchFilters,
): Promise<ApplicationSearchResult> {
  return searchApplications(filters);
}

export async function searchApplicationsFromParams(
  params: Record<string, string | string[] | undefined>,
): Promise<ApplicationSearchResult> {
  return searchApplications(parseApplicationSearchParams(params));
}

export async function getPromptsInbox(): Promise<PendingPromptRunItem[]> {
  runTrackerMaintenance();
  return listPendingPromptRuns();
}

export async function getApplicationTimeline(
  applicationId: string,
): Promise<TimelineEvent[]> {
  return listApplicationTimeline(applicationId);
}

export async function getSimilarApplications(
  company: string | null | undefined,
  role: string | null | undefined,
  excludeId?: string,
): Promise<Application[]> {
  return findSimilarApplications(company, role, excludeId);
}

export async function updateApplicationNotes(
  applicationId: string,
  notesHtml: string,
) {
  const existing = getApplicationById(applicationId);
  if (!existing) {
    return { ok: false as const, error: "Application not found." };
  }

  const plain = htmlToPlainText(notesHtml);
  const updated = updateApplicationNotesRow(applicationId, plain || null, notesHtml);
  if (!updated) {
    return { ok: false as const, error: "Failed to save notes." };
  }

  await writeAuditLog("application.notes_updated", "applications", applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  return { ok: true as const };
}

export async function deleteApplication(applicationId: string) {
  const existing = getApplicationById(applicationId);
  if (!existing) {
    return { ok: false as const, error: "Application not found." };
  }

  const deleted = deleteApplicationRow(applicationId);
  if (!deleted) {
    return { ok: false as const, error: "Failed to delete application." };
  }

  await writeAuditLog("application.deleted", "applications", applicationId, {
    company: existing.company,
    role: existing.role,
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  revalidatePath("/prompts");
  return { ok: true as const };
}
