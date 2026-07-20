import { randomUUID } from "crypto";
import type {
  Application,
  ApplicationStatus,
  AuditLogEntry,
  Contact,
  CoverLetterVersion,
  CoverLetterVersionStatus,
  ColdEmailRoleTemplate,
  DraftStatus,
  EmailKind,
  EmailRecord,
  GoogleTokensRow,
  JdParsed,
  MasterCoverLetter,
  MasterResume,
  ResumeVersion,
  ResumeVersionStatus,
  Profile,
  PromptRun,
  PromptRunKind,
  PromptRunStatus,
  PromptTemplate,
  EmailSource,
  VerificationStatus,
} from "@/lib/db/types";
import { getDb, parseJson, SINGLETON_ID } from "@/lib/db/index";

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    full_name: (row.full_name as string | null) ?? null,
    headline: (row.headline as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    timezone: (row.timezone as string) ?? "UTC",
    drive_root_id: (row.drive_root_id as string | null) ?? null,
    preferred_tone: (row.preferred_tone as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    github_url: (row.github_url as string | null) ?? null,
    portfolio_url: (row.portfolio_url as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapMasterResume(row: Record<string, unknown>): MasterResume {
  return {
    content: parseJson(row.content as string, {}),
    rules: parseJson(row.rules as string, { never_fabricate: true }),
    doc_id: (row.doc_id as string | null) ?? null,
    doc_layout: parseJson(row.doc_layout as string | null, null),
    doc_synced_at: (row.doc_synced_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapPromptTemplate(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    kind: row.kind as string,
    version: row.version as number,
    body: row.body as string,
    variables: parseJson(row.variables as string, [] as string[]),
    output_schema: parseJson(row.output_schema as string | null, null),
    active: Boolean(row.active),
    notes: (row.notes as string | null) ?? null,
  };
}

function mapPromptRun(row: Record<string, unknown>): PromptRun {
  return {
    id: row.id as string,
    kind: row.kind as PromptRunKind,
    prompt_text: row.prompt_text as string,
    target_entity: (row.target_entity as string | null) ?? null,
    target_entity_id: (row.target_entity_id as string | null) ?? null,
    status: row.status as PromptRunStatus,
    exported_at: row.exported_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    raw_response: (row.raw_response as string | null) ?? null,
    parsed_response: parseJson(row.parsed_response as string | null, null),
    validation_errors: parseJson(row.validation_errors as string | null, null),
  };
}

function mapGoogleTokens(row: Record<string, unknown>): GoogleTokensRow {
  return {
    encrypted_access_token: row.encrypted_access_token as string,
    encrypted_refresh_token: row.encrypted_refresh_token as string,
    scope: row.scope as string,
    expires_at: row.expires_at as string,
    status: row.status as GoogleTokensRow["status"],
  };
}

export function getProfileRow(): Profile | null {
  const row = getDb()
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(SINGLETON_ID) as Record<string, unknown> | undefined;
  return row ? mapProfile(row) : null;
}

export function upsertProfileRow(input: {
  full_name: string;
  headline?: string | null;
  location?: string | null;
  timezone?: string;
  preferred_tone?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
}) {
  const existing = getProfileRow();
  const phone =
    input.phone !== undefined ? input.phone : (existing?.phone ?? null);
  const linkedin_url =
    input.linkedin_url !== undefined
      ? input.linkedin_url
      : (existing?.linkedin_url ?? null);
  const github_url =
    input.github_url !== undefined
      ? input.github_url
      : (existing?.github_url ?? null);
  const portfolio_url =
    input.portfolio_url !== undefined
      ? input.portfolio_url
      : (existing?.portfolio_url ?? null);

  getDb()
    .prepare(
      `INSERT INTO profiles (
         id, full_name, headline, location, timezone, preferred_tone,
         phone, linkedin_url, github_url, portfolio_url
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         full_name = excluded.full_name,
         headline = excluded.headline,
         location = excluded.location,
         timezone = excluded.timezone,
         preferred_tone = excluded.preferred_tone,
         phone = excluded.phone,
         linkedin_url = excluded.linkedin_url,
         github_url = excluded.github_url,
         portfolio_url = excluded.portfolio_url`,
    )
    .run(
      SINGLETON_ID,
      input.full_name,
      input.headline ?? null,
      input.location ?? null,
      input.timezone ?? "UTC",
      input.preferred_tone ?? null,
      phone,
      linkedin_url,
      github_url,
      portfolio_url,
    );
}

export function setDriveRootId(driveRootId: string) {
  getDb()
    .prepare(
      `INSERT INTO profiles (id, drive_root_id)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET drive_root_id = excluded.drive_root_id`,
    )
    .run(SINGLETON_ID, driveRootId);
}

function mapMasterCoverLetter(row: Record<string, unknown>): MasterCoverLetter {
  return {
    doc_id: (row.doc_id as string | null) ?? null,
    doc_layout: parseJson(row.doc_layout as string | null, null),
    doc_synced_at: (row.doc_synced_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function getMasterCoverLetterRow(): MasterCoverLetter | null {
  const row = getDb()
    .prepare("SELECT * FROM master_cover_letter WHERE id = ?")
    .get(SINGLETON_ID) as Record<string, unknown> | undefined;
  return row ? mapMasterCoverLetter(row) : null;
}

export function upsertMasterCoverLetterRow(input: {
  doc_id?: string | null;
  doc_layout?: Record<string, unknown> | null;
  doc_synced_at?: string | null;
}) {
  const existing = getMasterCoverLetterRow();
  const doc_id = input.doc_id !== undefined ? input.doc_id : existing?.doc_id ?? null;
  const doc_layout =
    input.doc_layout !== undefined ? input.doc_layout : existing?.doc_layout ?? null;
  const doc_synced_at =
    input.doc_synced_at !== undefined
      ? input.doc_synced_at
      : existing?.doc_synced_at ?? null;

  getDb()
    .prepare(
      `INSERT INTO master_cover_letter (id, doc_id, doc_layout, doc_synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         doc_id = excluded.doc_id,
         doc_layout = excluded.doc_layout,
         doc_synced_at = excluded.doc_synced_at`,
    )
    .run(
      SINGLETON_ID,
      doc_id,
      doc_layout ? JSON.stringify(doc_layout) : null,
      doc_synced_at,
    );
}

export function getMasterResumeRow(): MasterResume | null {
  const row = getDb()
    .prepare("SELECT * FROM master_resume WHERE id = ?")
    .get(SINGLETON_ID) as Record<string, unknown> | undefined;
  return row ? mapMasterResume(row) : null;
}

export function upsertMasterResumeRow(input: {
  content: Record<string, unknown>;
  rules?: Record<string, unknown>;
  doc_id?: string | null;
  doc_layout?: Record<string, unknown> | null;
  doc_synced_at?: string | null;
}) {
  const existing = getMasterResumeRow();
  const doc_id = input.doc_id !== undefined ? input.doc_id : existing?.doc_id ?? null;
  const doc_layout =
    input.doc_layout !== undefined ? input.doc_layout : existing?.doc_layout ?? null;
  const doc_synced_at =
    input.doc_synced_at !== undefined
      ? input.doc_synced_at
      : existing?.doc_synced_at ?? null;

  getDb()
    .prepare(
      `INSERT INTO master_resume (id, content, rules, doc_id, doc_layout, doc_synced_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         rules = excluded.rules,
         doc_id = excluded.doc_id,
         doc_layout = excluded.doc_layout,
         doc_synced_at = excluded.doc_synced_at`,
    )
    .run(
      SINGLETON_ID,
      JSON.stringify(input.content),
      JSON.stringify(input.rules ?? { never_fabricate: true }),
      doc_id,
      doc_layout ? JSON.stringify(doc_layout) : null,
      doc_synced_at,
    );
}

export function getActivePromptTemplate(kind: string): PromptTemplate | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM prompt_templates
       WHERE kind = ? AND active = 1
       ORDER BY version DESC
       LIMIT 1`,
    )
    .get(kind) as Record<string, unknown> | undefined;
  return row ? mapPromptTemplate(row) : null;
}

export function createPromptRun(
  kind: PromptRunKind,
  target?: { entity: string; entityId: string },
): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO prompt_runs (id, kind, prompt_text, status, target_entity, target_entity_id)
       VALUES (?, ?, '', 'pending', ?, ?)`,
    )
    .run(id, kind, target?.entity ?? null, target?.entityId ?? null);
  return id;
}

export function updatePromptRunText(id: string, promptText: string) {
  getDb()
    .prepare(
      `UPDATE prompt_runs SET prompt_text = ? WHERE id = ? AND status = 'pending'`,
    )
    .run(promptText, id);
}

export function getPromptRunById(id: string): PromptRun | null {
  const row = getDb()
    .prepare("SELECT * FROM prompt_runs WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapPromptRun(row) : null;
}

export function updatePromptRunValidationErrors(
  id: string,
  errors: unknown[],
  rawResponse?: string,
) {
  getDb()
    .prepare(
      `UPDATE prompt_runs
       SET validation_errors = ?, raw_response = COALESCE(?, raw_response)
       WHERE id = ? AND status = 'pending'`,
    )
    .run(JSON.stringify(errors), rawResponse ?? null, id);
}

export function completePromptRun(
  id: string,
  rawResponse: string,
  parsedResponse: Record<string, unknown>,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE prompt_runs
       SET status = 'completed',
           raw_response = ?,
           parsed_response = ?,
           validation_errors = NULL,
           completed_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .run(rawResponse, JSON.stringify(parsedResponse), id);
  return result.changes > 0;
}

export function abandonPromptRunRow(id: string) {
  getDb()
    .prepare(
      `UPDATE prompt_runs SET status = 'abandoned' WHERE id = ? AND status = 'pending'`,
    )
    .run(id);
}

export function listRecentPromptRuns(limit = 10): PromptRun[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM prompt_runs ORDER BY exported_at DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapPromptRun);
}

export function hasCompletedDemoPrompt(): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM prompt_runs
       WHERE kind = 'hello_world' AND status = 'completed'
       LIMIT 1`,
    )
    .get();
  return Boolean(row);
}

export function getGoogleTokensRow(): GoogleTokensRow | null {
  const row = getDb()
    .prepare("SELECT * FROM google_tokens WHERE id = ?")
    .get(SINGLETON_ID) as Record<string, unknown> | undefined;
  return row ? mapGoogleTokens(row) : null;
}

export function saveGoogleTokensRow(input: {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  scope: string;
  expires_at: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO google_tokens (
         id, encrypted_access_token, encrypted_refresh_token, scope, expires_at, status
       ) VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         scope = excluded.scope,
         expires_at = excluded.expires_at,
         status = 'active'`,
    )
    .run(
      SINGLETON_ID,
      input.encrypted_access_token,
      input.encrypted_refresh_token,
      input.scope,
      input.expires_at,
    );
}

export function markGoogleTokensRevokedRow() {
  getDb()
    .prepare(`UPDATE google_tokens SET status = 'revoked' WHERE id = ?`)
    .run(SINGLETON_ID);
}

export function deleteGoogleTokensRow() {
  getDb().prepare("DELETE FROM google_tokens WHERE id = ?").run(SINGLETON_ID);
}

export function insertAuditLog(input: {
  action: string;
  entity?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
}) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (id, action, entity, entity_id, payload)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.action,
      input.entity ?? null,
      input.entity_id ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    );
}

export function listRecentAuditLogs(limit = 20): AuditLogEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    action: row.action as string,
    entity: (row.entity as string | null) ?? null,
    entity_id: (row.entity_id as string | null) ?? null,
    payload: parseJson(row.payload as string | null, null),
    created_at: row.created_at as string,
  }));
}

function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    company: (row.company as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    job_url: (row.job_url as string | null) ?? null,
    jd_raw: row.jd_raw as string,
    jd_parsed: parseJson(row.jd_parsed as string | null, null),
    status: row.status as ApplicationStatus,
    notes: (row.notes as string | null) ?? null,
    notes_html: (row.notes_html as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    company_blurb: (row.company_blurb as string | null) ?? null,
    email_instructions: (row.email_instructions as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function insertApplication(input: {
  company?: string | null;
  role?: string | null;
  job_url?: string | null;
  jd_raw: string;
  notes?: string | null;
  email_instructions?: string | null;
}): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO applications (id, company, role, job_url, jd_raw, notes, email_instructions, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    )
    .run(
      id,
      input.company?.trim() || null,
      input.role?.trim() || null,
      input.job_url?.trim() || null,
      input.jd_raw,
      input.notes?.trim() || null,
      input.email_instructions?.trim() || null,
    );
  return id;
}

export function getApplicationById(id: string): Application | null {
  const row = getDb()
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapApplication(row) : null;
}

export function listApplications(limit = 100): Application[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM applications ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapApplication);
}

export function updateApplicationStatusRow(
  id: string,
  status: ApplicationStatus,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE applications SET status = ? WHERE id = ?`,
    )
    .run(status, id);
  return result.changes > 0;
}

export function updateApplicationJdParsed(
  id: string,
  jdParsed: JdParsed,
  meta?: { company?: string; role?: string },
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE applications
       SET jd_parsed = ?,
           company = COALESCE(?, company),
           role = COALESCE(?, role)
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(jdParsed),
      meta?.company?.trim() || null,
      meta?.role?.trim() || null,
      id,
    );
  return result.changes > 0;
}

export function listApplicationStatusTransitions(applicationId: string) {
  const rows = getDb()
    .prepare(
      `SELECT action, payload, created_at
       FROM audit_log
       WHERE entity = 'applications' AND entity_id = ?
         AND action = 'application.status_changed'
       ORDER BY created_at ASC`,
    )
    .all(applicationId) as Record<string, unknown>[];
  return rows.map((row) => ({
    action: row.action as string,
    payload: parseJson(row.payload as string | null, null),
    created_at: row.created_at as string,
  }));
}

function mapResumeVersion(row: Record<string, unknown>): ResumeVersion {
  return {
    id: row.id as string,
    application_id: row.application_id as string,
    version: row.version as number,
    content: parseJson(row.content as string, {
      experience: [],
      projects: [],
      skills: [],
      education: [],
    }),
    drive_pdf_id: (row.drive_pdf_id as string | null) ?? null,
    drive_docx_id: (row.drive_docx_id as string | null) ?? null,
    drive_doc_id: (row.drive_doc_id as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    user_rating: (row.user_rating as number | null) ?? null,
    status: row.status as ResumeVersionStatus,
    created_at: row.created_at as string,
  };
}

export function getNextResumeVersionNumber(applicationId: string): number {
  const row = getDb()
    .prepare(
      `SELECT MAX(version) AS max_version FROM resume_versions WHERE application_id = ?`,
    )
    .get(applicationId) as { max_version: number | null };
  return (row.max_version ?? 0) + 1;
}

export function insertResumeVersion(input: {
  id: string;
  application_id: string;
  version: number;
  content: Record<string, unknown>;
  prompt_run_id: string;
  status?: ResumeVersionStatus;
}): void {
  getDb()
    .prepare(
      `INSERT INTO resume_versions (id, application_id, version, content, prompt_run_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.application_id,
      input.version,
      JSON.stringify(input.content),
      input.prompt_run_id,
      input.status ?? "uploading",
    );
}

export function updateResumeVersionDriveIds(
  id: string,
  drivePdfId: string | null,
  driveDocxId: string | null,
  driveDocId?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE resume_versions
       SET drive_pdf_id = ?, drive_docx_id = ?, drive_doc_id = ?, status = 'ready'
       WHERE id = ?`,
    )
    .run(drivePdfId, driveDocxId, driveDocId ?? null, id);
}

export function markResumeVersionUploadFailed(id: string): void {
  getDb()
    .prepare(`UPDATE resume_versions SET status = 'upload_failed' WHERE id = ?`)
    .run(id);
}

export function updateResumeVersionContentForRetry(
  id: string,
  content: Record<string, unknown> | object,
): void {
  getDb()
    .prepare(
      `UPDATE resume_versions
       SET content = ?, status = 'uploading'
       WHERE id = ?`,
    )
    .run(JSON.stringify(content), id);
}

export function getResumeVersion(
  applicationId: string,
  version: number,
): ResumeVersion | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM resume_versions WHERE application_id = ? AND version = ?`,
    )
    .get(applicationId, version) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

export function listResumeVersions(applicationId: string): ResumeVersion[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM resume_versions WHERE application_id = ? ORDER BY version DESC`,
    )
    .all(applicationId) as Record<string, unknown>[];
  return rows.map(mapResumeVersion);
}

export function getResumeVersionById(id: string): ResumeVersion | null {
  const row = getDb()
    .prepare("SELECT * FROM resume_versions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

function mapCoverLetterVersion(row: Record<string, unknown>): CoverLetterVersion {
  return {
    id: row.id as string,
    application_id: row.application_id as string,
    resume_version_id: (row.resume_version_id as string | null) ?? null,
    version: row.version as number,
    content: parseJson(row.content as string, {
      opening_hook: "",
      why_this_role: "",
      evidence_points: [],
      why_this_company: "",
      cta: "",
      body: "",
    }),
    drive_pdf_id: (row.drive_pdf_id as string | null) ?? null,
    drive_docx_id: (row.drive_docx_id as string | null) ?? null,
    drive_doc_id: (row.drive_doc_id as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    edited_from_version_id:
      (row.edited_from_version_id as string | null) ?? null,
    status: row.status as CoverLetterVersionStatus,
    created_at: row.created_at as string,
  };
}

export function getNextCoverLetterVersionNumber(applicationId: string): number {
  const row = getDb()
    .prepare(
      `SELECT MAX(version) AS max_version FROM cover_letter_versions WHERE application_id = ?`,
    )
    .get(applicationId) as { max_version: number | null };
  return (row.max_version ?? 0) + 1;
}

export function insertCoverLetterVersion(input: {
  id: string;
  application_id: string;
  resume_version_id?: string | null;
  version: number;
  content: Record<string, unknown>;
  prompt_run_id?: string | null;
  edited_from_version_id?: string | null;
  status?: CoverLetterVersionStatus;
}): void {
  getDb()
    .prepare(
      `INSERT INTO cover_letter_versions (
         id, application_id, resume_version_id, version, content,
         prompt_run_id, edited_from_version_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.application_id,
      input.resume_version_id ?? null,
      input.version,
      JSON.stringify(input.content),
      input.prompt_run_id ?? null,
      input.edited_from_version_id ?? null,
      input.status ?? "uploading",
    );
}

export function updateCoverLetterVersionDriveIds(
  id: string,
  drivePdfId: string | null,
  driveDocxId: string | null,
  driveDocId?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE cover_letter_versions
       SET drive_pdf_id = ?, drive_docx_id = ?, drive_doc_id = ?, status = 'ready'
       WHERE id = ?`,
    )
    .run(drivePdfId, driveDocxId, driveDocId ?? null, id);
}

export function markCoverLetterVersionUploadFailed(id: string): void {
  getDb()
    .prepare(`UPDATE cover_letter_versions SET status = 'upload_failed' WHERE id = ?`)
    .run(id);
}

export function updateCoverLetterVersionContentForRetry(
  id: string,
  content: Record<string, unknown> | object,
): void {
  getDb()
    .prepare(
      `UPDATE cover_letter_versions
       SET content = ?, status = 'uploading'
       WHERE id = ?`,
    )
    .run(JSON.stringify(content), id);
}

export function listCoverLetterVersions(
  applicationId: string,
): CoverLetterVersion[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM cover_letter_versions WHERE application_id = ? ORDER BY version DESC`,
    )
    .all(applicationId) as Record<string, unknown>[];
  return rows.map(mapCoverLetterVersion);
}

export function getCoverLetterVersion(
  applicationId: string,
  version: number,
): CoverLetterVersion | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM cover_letter_versions WHERE application_id = ? AND version = ?`,
    )
    .get(applicationId, version) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

export function getCoverLetterVersionById(id: string): CoverLetterVersion | null {
  const row = getDb()
    .prepare("SELECT * FROM cover_letter_versions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

export function updateApplicationCompanyBlurb(
  id: string,
  companyBlurb: string | null,
): boolean {
  const result = getDb()
    .prepare(`UPDATE applications SET company_blurb = ? WHERE id = ?`)
    .run(companyBlurb?.trim() || null, id);
  return result.changes > 0;
}

export function updateApplicationEmailInstructions(
  id: string,
  emailInstructions: string | null,
): boolean {
  const result = getDb()
    .prepare(`UPDATE applications SET email_instructions = ? WHERE id = ?`)
    .run(emailInstructions?.trim() || null, id);
  return result.changes > 0;
}

export function getLatestReadyResumeVersion(
  applicationId: string,
): ResumeVersion | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM resume_versions
       WHERE application_id = ? AND status = 'ready'
       ORDER BY version DESC
       LIMIT 1`,
    )
    .get(applicationId) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

export function getLatestReadyCoverLetterVersion(
  applicationId: string,
): CoverLetterVersion | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM cover_letter_versions
       WHERE application_id = ? AND status = 'ready'
       ORDER BY version DESC
       LIMIT 1`,
    )
    .get(applicationId) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

function mapContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    application_id: row.application_id as string,
    name: row.name as string,
    role: (row.role as string | null) ?? null,
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    company_domain: (row.company_domain as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    email_confidence: (row.email_confidence as number | null) ?? null,
    email_source: (row.email_source as EmailSource | null) ?? null,
    verification_status: row.verification_status as VerificationStatus,
    notes: (row.notes as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function listContacts(applicationId: string): Contact[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM contacts WHERE application_id = ? ORDER BY created_at DESC`,
    )
    .all(applicationId) as Record<string, unknown>[];
  return rows.map(mapContact);
}

export function getContactById(id: string): Contact | null {
  const row = getDb()
    .prepare("SELECT * FROM contacts WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapContact(row) : null;
}

export function insertContact(input: {
  application_id: string;
  name: string;
  role?: string | null;
  linkedin_url?: string | null;
  company_domain?: string | null;
  email?: string | null;
  email_confidence?: number | null;
  email_source?: EmailSource | null;
  verification_status: VerificationStatus;
  notes?: string | null;
  prompt_run_id?: string | null;
}): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO contacts (
         id, application_id, name, role, linkedin_url, company_domain,
         email, email_confidence, email_source, verification_status, notes, prompt_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.application_id,
      input.name,
      input.role ?? null,
      input.linkedin_url ?? null,
      input.company_domain ?? null,
      input.email ?? null,
      input.email_confidence ?? null,
      input.email_source ?? null,
      input.verification_status,
      input.notes ?? null,
      input.prompt_run_id ?? null,
    );
  return id;
}

export function deleteContact(id: string): boolean {
  const result = getDb().prepare("DELETE FROM contacts WHERE id = ?").run(id);
  return result.changes > 0;
}

function mapEmail(row: Record<string, unknown>): EmailRecord {
  return {
    id: row.id as string,
    application_id: row.application_id as string,
    contact_id: row.contact_id as string,
    kind: row.kind as EmailKind,
    subject: row.subject as string,
    body_md: row.body_md as string,
    body_html: row.body_html as string,
    role_template: (row.role_template as ColdEmailRoleTemplate | null) ?? null,
    gmail_draft_id: (row.gmail_draft_id as string | null) ?? null,
    gmail_message_id: (row.gmail_message_id as string | null) ?? null,
    draft_status: row.draft_status as DraftStatus,
    draft_error: (row.draft_error as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function listEmails(applicationId: string): EmailRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM emails WHERE application_id = ? ORDER BY created_at DESC`,
    )
    .all(applicationId) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export function getEmailById(id: string): EmailRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM emails WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapEmail(row) : null;
}

export function listEmailsByIds(ids: string[]): EmailRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM emails WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export function listEmailsByPromptRun(promptRunId: string): EmailRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM emails WHERE prompt_run_id = ? ORDER BY created_at ASC`)
    .all(promptRunId) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export function insertEmail(input: {
  application_id: string;
  contact_id: string;
  kind?: EmailKind;
  subject: string;
  body_md: string;
  body_html: string;
  role_template?: ColdEmailRoleTemplate | null;
  prompt_run_id?: string | null;
  draft_status?: DraftStatus;
}): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO emails (
         id, application_id, contact_id, kind, subject, body_md, body_html,
         role_template, prompt_run_id, draft_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.application_id,
      input.contact_id,
      input.kind ?? "cold",
      input.subject,
      input.body_md,
      input.body_html,
      input.role_template ?? null,
      input.prompt_run_id ?? null,
      input.draft_status ?? "pending",
    );
  return id;
}

/** Claim a pending/failed email for draft creation. Returns false if already claimed. */
export function claimEmailForDraftCreation(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET draft_status = 'creating', draft_error = NULL
       WHERE id = ? AND draft_status IN ('pending', 'failed', 'deleted_externally')`,
    )
    .run(id);
  return result.changes > 0;
}

export function markEmailDraftCreated(
  id: string,
  gmailDraftId: string,
  gmailMessageId?: string | null,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET draft_status = 'created',
           gmail_draft_id = ?,
           gmail_message_id = ?,
           draft_error = NULL
       WHERE id = ?`,
    )
    .run(gmailDraftId, gmailMessageId ?? null, id);
  return result.changes > 0;
}

export function markEmailDraftFailed(id: string, error: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET draft_status = 'failed', draft_error = ?
       WHERE id = ?`,
    )
    .run(error.slice(0, 500), id);
  return result.changes > 0;
}

export function markEmailDraftDeletedExternally(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET draft_status = 'deleted_externally',
           gmail_draft_id = NULL,
           gmail_message_id = NULL
       WHERE id = ?`,
    )
    .run(id);
  return result.changes > 0;
}

export function updateEmailContent(
  id: string,
  input: { subject?: string; body_md?: string; body_html?: string },
): boolean {
  const existing = getEmailById(id);
  if (!existing) return false;
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET subject = ?, body_md = ?, body_html = ?
       WHERE id = ?`,
    )
    .run(
      input.subject ?? existing.subject,
      input.body_md ?? existing.body_md,
      input.body_html ?? existing.body_html,
      id,
    );
  return result.changes > 0;
}

export function resetEmailDraftForRecreate(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE emails
       SET draft_status = 'pending',
           gmail_draft_id = NULL,
           gmail_message_id = NULL,
           draft_error = NULL
       WHERE id = ?`,
    )
    .run(id);
  return result.changes > 0;
}
