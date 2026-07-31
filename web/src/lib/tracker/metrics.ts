export interface DashboardMetrics {
  totalApplications: number;
  applicationsThisWeek: number;
  companiesContacted: number;
  emailsSent: number;
}

export interface DashboardMetricsRow {
  total: number;
  this_week: number;
  companies_contacted: number;
  emails_sent: number;
}

export function mapDashboardMetrics(row: DashboardMetricsRow): DashboardMetrics {
  return {
    totalApplications: Number(row.total ?? 0),
    applicationsThisWeek: Number(row.this_week ?? 0),
    companiesContacted: Number(row.companies_contacted ?? 0),
    emailsSent: Number(row.emails_sent ?? 0),
  };
}
