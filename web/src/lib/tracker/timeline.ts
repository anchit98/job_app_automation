import type { PromptRunKind } from "@/lib/db/types";

export interface TimelineEvent {
  id: string;
  kind: "audit" | "prompt";
  action: string;
  label: string;
  detail?: string | null;
  created_at: string;
  prompt_run_id?: string | null;
  prompt_kind?: PromptRunKind | null;
}

const ACTION_LABELS: Record<string, string> = {
  "application.created": "Application created",
  "application.status_changed": "Status updated",
  "application.jd_parsed": "Job description parsed",
  "application.notes_updated": "Notes updated",
  "application.deleted": "Application deleted",
  "prompt.exported": "Prompt exported",
  "prompt.completed": "ChatGPT response accepted",
  "resume.generated": "Resume generated",
  "cover_letter.generated": "Cover letter generated",
  "cold_emails.accepted": "Cold emails saved",
  "gmail.draft_created": "Gmail draft created",
  "follow_up.prompt_enqueued": "Follow-up prompt queued",
  "follow_up.generated": "Follow-up email generated",
  "follow_up.sent": "Follow-up marked sent",
  "follow_up.snoozed": "Follow-up snoozed",
  "follow_up.skipped": "Follow-up skipped",
  "follow_ups.scheduled": "Follow-ups scheduled",
  "email_discovery_started": "Email discovery started",
};

const PROMPT_KIND_LABELS: Record<string, string> = {
  jd_parse: "JD parse",
  resume: "Resume generation",
  cover_letter: "Cover letter",
  cold_email: "Cold emails",
  email_discovery: "Email discovery",
  follow_up: "Follow-up",
  hello_world: "Demo prompt",
  repair: "Repair prompt",
};

export function labelForAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/\./g, " ");
}

export function labelForPromptKind(kind: string, status: string): string {
  const base = PROMPT_KIND_LABELS[kind] ?? kind;
  if (status === "pending") return `${base} — awaiting paste-back`;
  if (status === "abandoned") return `${base} — abandoned`;
  if (status === "completed") return `${base} — completed`;
  return base;
}

export function statusChangeDetail(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const from = payload.from;
  const to = payload.to;
  if (typeof from === "string" && typeof to === "string") {
    return `${from} → ${to}`;
  }
  return null;
}
