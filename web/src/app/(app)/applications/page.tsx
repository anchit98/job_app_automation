import { searchApplicationsFromParams } from "@/app/actions/tracker";
import { getApplicationPipelineSummaries } from "@/app/actions/pipeline";
import {
  getApplicationsWithContacts,
  getDueFollowUpsByApplicationIds,
} from "@/lib/follow-ups/queries";
import { ApplicationsTable } from "@/components/applications/applications-table";

type PipelineSummary = {
  pipeline_id: string;
  status: string;
  current_stage: string | null;
  error: string | null;
  can_resume: boolean;
};

type DueFollowUp = {
  id: string;
  sequence: 1 | 2;
  due_at: string;
  contact_name: string | null;
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await searchApplicationsFromParams(params);
  const ids = result.items.map((i) => i.id);

  let summaries: Record<string, PipelineSummary> = {};
  let withContacts = new Set<string>();
  let dueByApp: Record<string, DueFollowUp> = {};

  // Optional enrichment only — never fail the Jobs page on pooler timeouts.
  try {
    summaries = await getApplicationPipelineSummaries(ids);
  } catch {
    summaries = {};
  }
  try {
    withContacts = await getApplicationsWithContacts(ids);
  } catch {
    withContacts = new Set<string>();
  }
  try {
    dueByApp = await getDueFollowUpsByApplicationIds(ids);
  } catch {
    dueByApp = {};
  }

  const items = result.items.map((item) => ({
    ...item,
    pipeline: Object.prototype.hasOwnProperty.call(summaries, item.id)
      ? summaries[item.id]
      : null,
    has_contact: withContacts.has(item.id),
    due_follow_up: Object.prototype.hasOwnProperty.call(dueByApp, item.id)
      ? dueByApp[item.id]
      : null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="li-page-title">Jobs</h1>
          <p className="text-[14px] text-on-surface-variant mt-1">
            Search, filter, and track every role in your pipeline.
          </p>
        </div>
      </div>

      <ApplicationsTable initial={{ ...result, items }} />
    </div>
  );
}
