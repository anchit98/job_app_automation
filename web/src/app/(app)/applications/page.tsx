import { searchApplicationsFromParams } from "@/app/actions/tracker";
import { getApplicationPipelineSummaries } from "@/app/actions/pipeline";
import {
  getApplicationsWithContacts,
  getDueFollowUpsByApplicationIds,
} from "@/lib/follow-ups/queries";
import { ApplicationsTable } from "@/components/applications/applications-table";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await searchApplicationsFromParams(params);
  const ids = result.items.map((i) => i.id);
  const [summaries, withContacts, dueByApp] = await Promise.all([
    getApplicationPipelineSummaries(ids),
    getApplicationsWithContacts(ids),
    getDueFollowUpsByApplicationIds(ids),
  ]);
  const items = result.items.map((item) => ({
    ...item,
    pipeline: summaries[item.id] ?? null,
    has_contact: withContacts.has(item.id),
    due_follow_up: dueByApp[item.id] ?? null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="li-page-title">Jobs</h1>
          <p className="text-[14px] text-on-surface-variant mt-1">
            Search, filter, and track every role in your pipeline. Follow up on
            rows that have a contact when a follow-up is due.
          </p>
        </div>
      </div>

      <ApplicationsTable initial={{ ...result, items }} />
    </div>
  );
}
