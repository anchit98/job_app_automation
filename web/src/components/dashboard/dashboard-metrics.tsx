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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
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

      {/* Comfortable metrics grid — avoids squeezed 5-column cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4">
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
          hint={
            metrics.snoozedFollowUps > 0
              ? `${metrics.snoozedFollowUps} snoozed`
              : "Scheduled in Emails tab"
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
