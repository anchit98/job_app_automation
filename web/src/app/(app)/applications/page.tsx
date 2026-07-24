import { searchApplicationsFromParams } from "@/app/actions/tracker";
import { getApplicationPipelineSummaries } from "@/app/actions/pipeline";
import { ApplicationsTable } from "@/components/applications/applications-table";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await searchApplicationsFromParams(params);
  const summaries = await getApplicationPipelineSummaries(
    result.items.map((i) => i.id),
  );
  const items = result.items.map((item) => ({
    ...item,
    pipeline: summaries[item.id] ?? null,
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
