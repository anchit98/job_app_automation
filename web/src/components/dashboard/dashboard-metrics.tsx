import type { DashboardMetrics } from "@/lib/tracker/metrics";
import type { MetricsRange } from "@/lib/tracker/metrics-range";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MetricsDateFilter } from "@/components/dashboard/metrics-date-filter";

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  range: MetricsRange;
}

export function DashboardMetricsGrid({
  metrics,
  range,
}: DashboardMetricsGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            aria-hidden
          >
            monitoring
          </span>
          <h2 className="li-section-title">Pipeline metrics</h2>
        </div>
        <MetricsDateFilter range={range} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 max-md:gap-2">
        <MetricCard
          label="Total applications"
          value={metrics.totalApplications}
          icon="work"
          tone="primary"
        />
        <MetricCard
          label="This week"
          value={metrics.applicationsThisWeek}
          icon="trending_up"
          tone="success"
        />
        <MetricCard
          label="Gmail drafts"
          value={metrics.emailsSent}
          icon="drafts"
          tone="tertiary"
        />
        <MetricCard
          label="Companies contacted"
          value={metrics.companiesContacted}
          icon="apartment"
          tone="neutral"
        />
      </div>
    </div>
  );
}
