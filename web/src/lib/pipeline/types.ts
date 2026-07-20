export type PipelineStageId =
  | "create_application"
  | "jd_parse"
  | "resume"
  | "cover_letter"
  | "save_contacts"
  | "cold_email"
  | "gmail_drafts";

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "awaiting_chatgpt"
  | "completed"
  | "failed"
  | "skipped";

export type PipelineRunStatus =
  | "running"
  | "awaiting_chatgpt"
  | "completed"
  | "failed"
  | "needs_manual";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  prompt_run_id?: string | null;
  /** Extra cold-email batch runs queued after the first. */
  queued_prompt_run_ids?: string[];
  error?: string | null;
  detail?: string | null;
  chatgpt_url?: string | null;
  prompt_text?: string | null;
  repair_prompt?: string | null;
}

export interface PipelineContactInput {
  name: string;
  email: string;
  role?: string;
  linkedin_url?: string;
}

export interface PipelineRunRecord {
  id: string;
  application_id: string;
  status: PipelineRunStatus;
  current_stage: PipelineStageId | null;
  stages: PipelineStage[];
  contacts: PipelineContactInput[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const PIPELINE_STAGE_DEFS: Array<{
  id: PipelineStageId;
  label: string;
  needsChatGpt: boolean;
}> = [
  { id: "create_application", label: "Create application", needsChatGpt: false },
  { id: "jd_parse", label: "Parse job description", needsChatGpt: true },
  { id: "resume", label: "Tailor resume", needsChatGpt: true },
  { id: "cover_letter", label: "Write cover letter", needsChatGpt: true },
  { id: "save_contacts", label: "Save contacts", needsChatGpt: false },
  { id: "cold_email", label: "Draft cold emails", needsChatGpt: true },
  { id: "gmail_drafts", label: "Create Gmail drafts", needsChatGpt: false },
];

export function buildInitialStages(): PipelineStage[] {
  return PIPELINE_STAGE_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    status: "pending" as const,
  }));
}
