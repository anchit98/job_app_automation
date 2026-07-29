import Link from "next/link";
import type { DashboardMetrics } from "@/lib/tracker/metrics";
import { MetricCard } from "@/components/dashboard/metric-card";

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  formatted: {
    responseRate: string;
    interviewRate: string;
    offerRate: string;
  };
}

export function DashboardMetricsGrid({
  metrics,
  formatted,
}: DashboardMetricsGridProps) {
  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <h2 className="li-section-title">Pipeline metrics</h2>
        {metrics.incompleteApplied > 0 && (
          <Link
            href="/applications?status=applied"
            className="text-[12px] text-error hover:underline"
          >
            {metrics.incompleteApplied} applied without resume
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 md:grid-rows-3 gap-3 lg:gap-4 max-md:gap-2 flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
        <MetricCard label="Total applications" value={metrics.totalApplications} />
        <MetricCard
          label="This week"
          value={metrics.applicationsThisWeek}
          accent="secondary"
        />
        <MetricCard
          label="Pending prompts"
          value={metrics.pendingPrompts}
          href="/prompts"
          accent={metrics.pendingPrompts > 0 ? "primary" : "default"}
          hint="Open Prompts Inbox"
        />
        <MetricCard
          label="Pending follow-ups"
          value={metrics.pendingFollowUps}
          href="/applications"
          hint={
            metrics.snoozedFollowUps > 0
              ? `${metrics.snoozedFollowUps} snoozed`
              : "Open Jobs to follow up"
          }
        />
        <MetricCard label="Gmail drafts" value={metrics.emailsSent} />
        <MetricCard
          label="Response rate"
          value={formatted.responseRate}
          hint={
            metrics.responseRate == null
              ? "No applications marked applied yet"
              : "HR replied or beyond / applied+"
          }
        />
        <MetricCard
          label="Interview rate"
          value={formatted.interviewRate}
          hint={
            metrics.interviewRate == null
              ? "No applications marked applied yet"
              : "Interview scheduled or beyond / applied+"
          }
        />
        <MetricCard
          label="Offer rate"
          value={formatted.offerRate}
          hint={
            metrics.offerRate == null
              ? "No applications marked applied yet"
              : "Offer or accepted / applied+"
          }
        />
        <MetricCard
          label="Companies contacted"
          value={metrics.companiesContacted}
        />
      </div>
    </div>
  );
}
