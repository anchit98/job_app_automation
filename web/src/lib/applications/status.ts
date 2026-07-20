export const APPLICATION_STATUSES = [
  "draft",
  "ready",
  "applied",
  "email_sent",
  "hr_replied",
  "interview_scheduled",
  "rejected",
  "offer",
  "accepted",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  applied: "Applied",
  email_sent: "Email sent",
  hr_replied: "HR replied",
  interview_scheduled: "Interview scheduled",
  rejected: "Rejected",
  offer: "Offer",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}
