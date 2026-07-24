export type PromptRunKind =
  | "hello_world"
  | "jd_parse"
  | "resume"
  | "cover_letter"
  | "cold_email"
  | "follow_up"
  | "repair"
  | "email_discovery";

export type PromptRunStatus = "pending" | "completed" | "abandoned";

export type GoogleTokenStatus = "active" | "revoked";

export interface Profile {
  full_name: string | null;
  headline: string | null;
  location: string | null;
  timezone: string;
  drive_root_id: string | null;
  preferred_tone: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  setup_console_done_at: string | null;
  setup_guide_collapsed: boolean;
  has_avatar: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterResume {
  content: Record<string, unknown>;
  rules: Record<string, unknown>;
  doc_id: string | null;
  doc_layout: Record<string, unknown> | null;
  doc_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterCoverLetter {
  doc_id: string | null;
  doc_layout: Record<string, unknown> | null;
  doc_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplate {
  id: string;
  kind: string;
  version: number;
  body: string;
  variables: string[];
  output_schema: Record<string, unknown> | null;
  active: boolean;
  notes: string | null;
}

export interface PromptRun {
  id: string;
  kind: PromptRunKind;
  prompt_text: string;
  target_entity: string | null;
  target_entity_id: string | null;
  status: PromptRunStatus;
  exported_at: string;
  completed_at: string | null;
  raw_response: string | null;
  parsed_response: Record<string, unknown> | null;
  validation_errors: unknown[] | null;
}

export interface GoogleTokensRow {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  scope: string;
  expires_at: string;
  status: GoogleTokenStatus;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

import type { ApplicationStatus } from "@/lib/applications/status";
import type { ResumeContent } from "@/lib/resume/fabrication";

export const DRIVE_ROOT_FOLDER_NAME = "Job Application Automation";

export type { ApplicationStatus };

export interface JdParsed {
  company?: string;
  role?: string;
  seniority?: string;
  must_have_keywords?: string[];
  nice_to_have_keywords?: string[];
  responsibilities?: string[];
  requirements?: string[];
  tech_stack?: string[];
  location?: string;
  remote_policy?: string;
}

export interface Application {
  id: string;
  company: string | null;
  role: string | null;
  job_url: string | null;
  jd_raw: string;
  jd_parsed: JdParsed | null;
  status: ApplicationStatus;
  notes: string | null;
  notes_html: string | null;
  language: string | null;
  company_blurb: string | null;
  email_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export type CoverLetterVersionStatus = "uploading" | "ready" | "upload_failed";

export interface CoverLetterContent {
  opening_hook: string;
  why_this_role: string;
  evidence_points: string[];
  why_this_company: string;
  cta: string;
  body: string;
  body_html?: string;
}

export interface CoverLetterVersion {
  id: string;
  application_id: string;
  resume_version_id: string | null;
  version: number;
  content: CoverLetterContent;
  drive_pdf_id: string | null;
  drive_docx_id: string | null;
  drive_doc_id: string | null;
  prompt_run_id: string | null;
  edited_from_version_id: string | null;
  status: CoverLetterVersionStatus;
  created_at: string;
}

export type ResumeVersionStatus = "uploading" | "ready" | "upload_failed";

export interface ResumeVersion {
  id: string;
  application_id: string;
  version: number;
  content: ResumeContent;
  drive_pdf_id: string | null;
  drive_docx_id: string | null;
  drive_doc_id: string | null;
  prompt_run_id: string | null;
  user_rating: number | null;
  status: ResumeVersionStatus;
  created_at: string;
}

export type EmailSource = "mailmeteor_manual" | "pattern_smtp" | "manual_entry";

export type VerificationStatus =
  | "valid"
  | "risky"
  | "unverified"
  | "no_email_available";

export interface Contact {
  id: string;
  application_id: string;
  name: string;
  role: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  email: string | null;
  email_confidence: number | null;
  email_source: EmailSource | null;
  verification_status: VerificationStatus;
  notes: string | null;
  prompt_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailDiscoveryPayload {
  linkedin_url: string;
  name?: string | null;
  role?: string | null;
  company_domain?: string | null;
}

export type EmailKind = "cold" | "follow_up";

export type DraftStatus =
  | "pending"
  | "creating"
  | "created"
  | "failed"
  | "deleted_externally";

export type FollowUpStatus =
  | "waiting"
  | "pending"
  | "processing"
  | "enqueued"
  | "snoozed"
  | "skipped"
  | "sent";

export interface FollowUp {
  id: string;
  application_id: string;
  email_id: string;
  sequence: 1 | 2;
  due_at: string | null;
  status: FollowUpStatus;
  snoozed_until: string | null;
  draft_email_id: string | null;
  prompt_run_id: string | null;
  sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ColdEmailRoleTemplate =
  | "hiring_manager"
  | "recruiter"
  | "founder"
  | "director_product"
  | "vp_product";

export interface EmailRecord {
  id: string;
  application_id: string;
  contact_id: string;
  kind: EmailKind;
  subject: string;
  body_md: string;
  body_html: string;
  role_template: ColdEmailRoleTemplate | null;
  gmail_draft_id: string | null;
  gmail_message_id: string | null;
  draft_status: DraftStatus;
  draft_error: string | null;
  sent_at: string | null;
  prompt_run_id: string | null;
  created_at: string;
  updated_at: string;
}
