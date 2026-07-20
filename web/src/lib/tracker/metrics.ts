import type { ApplicationStatus } from "@/lib/applications/status";

const APPLIED_OR_BEYOND: ApplicationStatus[] = [
  "applied",
  "email_sent",
  "hr_replied",
  "interview_scheduled",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

const RESPONSE_STATUSES: ApplicationStatus[] = [
  "hr_replied",
  "interview_scheduled",
  "offer",
  "accepted",
];

const INTERVIEW_STATUSES: ApplicationStatus[] = [
  "interview_scheduled",
  "offer",
  "accepted",
];

const OFFER_STATUSES: ApplicationStatus[] = ["offer", "accepted"];

export interface DashboardMetrics {
  totalApplications: number;
  applicationsThisWeek: number;
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  pendingFollowUps: number;
  snoozedFollowUps: number;
  companiesContacted: number;
  emailsSent: number;
  pendingPrompts: number;
  incompleteApplied: number;
}

export interface DashboardMetricsRow {
  total: number;
  this_week: number;
  applied_denominator: number;
  responded: number;
  interviewed: number;
  offered: number;
  companies_contacted: number;
  emails_sent: number;
  pending_prompts: number;
  pending_follow_ups: number;
  snoozed_follow_ups: number;
  incomplete_applied: number;
}

export function mapDashboardMetrics(row: DashboardMetricsRow): DashboardMetrics {
  const denom = row.applied_denominator;
  return {
    totalApplications: row.total,
    applicationsThisWeek: row.this_week,
    responseRate: denom > 0 ? row.responded / denom : null,
    interviewRate: denom > 0 ? row.interviewed / denom : null,
    offerRate: denom > 0 ? row.offered / denom : null,
    pendingFollowUps: row.pending_follow_ups,
    snoozedFollowUps: row.snoozed_follow_ups,
    companiesContacted: row.companies_contacted,
    emailsSent: row.emails_sent,
    pendingPrompts: row.pending_prompts,
    incompleteApplied: row.incomplete_applied,
  };
}

export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export {
  APPLIED_OR_BEYOND,
  RESPONSE_STATUSES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
};
