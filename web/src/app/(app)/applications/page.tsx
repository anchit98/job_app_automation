import Link from "next/link";
import { Suspense } from "react";
import { searchApplicationsFromParams } from "@/app/actions/tracker";
import { ApplicationsTable } from "@/components/applications/applications-table";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await searchApplicationsFromParams(params);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="li-page-title">Jobs</h1>
          <p className="text-[14px] text-on-surface-variant mt-1">
            Search, filter, and track every role in your pipeline.
          </p>
        </div>
        <Link href="/apply" className="li-btn-primary no-underline">
          <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
          Quick Apply
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="li-card p-8 text-center text-on-surface-variant text-[14px]">
            Loading applications…
          </div>
        }
      >
        <ApplicationsTable initial={result} />
      </Suspense>
    </div>
  );
}
