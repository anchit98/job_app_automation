import { randomUUID } from "crypto";
import { cache } from "react";
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
import { dbGet, dbAll, dbRun, getSql, parseJson, toJsonText } from "@/lib/db/index";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";

async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromAls = getRequestUserId();
  if (fromAls) return fromAls;
  return (await requireUser()).id;
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    full_name: (row.full_name as string | null) ?? null,
    headline: (row.headline as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    timezone: (row.timezone as string) ?? "Asia/Kolkata",
    drive_root_id: (row.drive_root_id as string | null) ?? null,
    preferred_tone: (row.preferred_tone as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    github_url: (row.github_url as string | null) ?? null,
    portfolio_url: (row.portfolio_url as string | null) ?? null,
    setup_console_done_at: (row.setup_console_done_at as string | null) ?? null,
    setup_guide_collapsed: Boolean(row.setup_guide_collapsed),
    has_avatar: Boolean(row.has_avatar ?? row.avatar_data),
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

// React.cache: the app layout and setup readiness both need the profile on
// every page render — dedupe to a single query per request.
export const getProfileRow = cache(async function getProfileRow(
  userId?: string,
): Promise<Profile | null> {
  const uid = await currentUserId(userId);
  // Never SELECT avatar_data here — blobs were wedging pooler ClientRead waits
  // on every AppShell render. Avatar bytes are loaded only via /api/profile/avatar.
  const row = (await dbGet(
    `SELECT full_name, headline, location, timezone, drive_root_id, preferred_tone,
            phone, linkedin_url, github_url, portfolio_url,
            setup_console_done_at, setup_guide_collapsed, created_at, updated_at,
            (avatar_data IS NOT NULL AND avatar_mime IS NOT NULL) AS has_avatar
       FROM profiles
      WHERE user_id = ?`,
    uid,
  )) as Record<string, unknown> | undefined;
  return row ? mapProfile(row) : null;
});

export async function upsertProfileRow(input: {
  full_name: string;
  headline?: string | null;
  location?: string | null;
  timezone?: string;
  preferred_tone?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  userId?: string;
}) {
  const uid = await currentUserId(input.userId);
  const existing = await getProfileRow(uid);
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

  await dbRun(`INSERT INTO profiles (
         user_id, full_name, headline, location, timezone, preferred_tone,
         phone, linkedin_url, github_url, portfolio_url
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = excluded.full_name,
         headline = excluded.headline,
         location = excluded.location,
         timezone = excluded.timezone,
         preferred_tone = excluded.preferred_tone,
         phone = excluded.phone,
         linkedin_url = excluded.linkedin_url,
         github_url = excluded.github_url,
         portfolio_url = excluded.portfolio_url`, uid,
      input.full_name,
      input.headline ?? null,
      input.location ?? null,
      input.timezone ?? "Asia/Kolkata",
      input.preferred_tone ?? null,
      phone,
      linkedin_url,
      github_url,
      portfolio_url,);
}

export async function setDriveRootId(driveRootId: string, userId?: string) {
  const uid = await currentUserId(userId);
  await dbRun(`INSERT INTO profiles (user_id, drive_root_id)
       VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET drive_root_id = excluded.drive_root_id`, uid, driveRootId);
}

export async function getProfileAvatarRow(userId?: string): Promise<{
  data: string;
  mime: string;
  updated_at: string;
} | null> {
  const uid = await currentUserId(userId);
  const row = (await dbGet(
    `SELECT avatar_data, avatar_mime, updated_at
     FROM profiles
     WHERE user_id = ? AND avatar_data IS NOT NULL AND avatar_mime IS NOT NULL`,
    uid,
  )) as Record<string, unknown> | undefined;
  if (!row?.avatar_data || !row?.avatar_mime) return null;
  return {
    data: row.avatar_data as string,
    mime: row.avatar_mime as string,
    updated_at: row.updated_at as string,
  };
}

export async function setProfileAvatarRow(input: {
  data: string;
  mime: string;
  userId?: string;
}) {
  const uid = await currentUserId(input.userId);
  await dbRun(
    `INSERT INTO profiles (user_id, avatar_data, avatar_mime, updated_at)
     VALUES (?, ?, ?, ((NOW() AT TIME ZONE 'utc')::text))
     ON CONFLICT (user_id) DO UPDATE SET
       avatar_data = excluded.avatar_data,
       avatar_mime = excluded.avatar_mime,
       updated_at = excluded.updated_at`,
    uid,
    input.data,
    input.mime,
  );
}

export async function clearProfileAvatarRow(userId?: string) {
  const uid = await currentUserId(userId);
  await dbRun(
    `UPDATE profiles
     SET avatar_data = NULL,
         avatar_mime = NULL,
         updated_at = ((NOW() AT TIME ZONE 'utc')::text)
     WHERE user_id = ?`,
    uid,
  );
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

export async function getMasterCoverLetterRow(userId?: string): Promise<MasterCoverLetter | null> {
  const uid = await currentUserId(userId);
  const row = await dbGet("SELECT * FROM master_cover_letter WHERE user_id = ?", uid) as Record<string, unknown> | undefined;
  return row ? mapMasterCoverLetter(row) : null;
}

export async function upsertMasterCoverLetterRow(input: {
  doc_id?: string | null;
  doc_layout?: Record<string, unknown> | null;
  doc_synced_at?: string | null;
  userId?: string;
}) {
  const uid = await currentUserId(input.userId);
  const existing = await getMasterCoverLetterRow(uid);
  const doc_id = input.doc_id !== undefined ? input.doc_id : existing?.doc_id ?? null;
  const doc_layout =
    input.doc_layout !== undefined ? input.doc_layout : existing?.doc_layout ?? null;
  const doc_synced_at =
    input.doc_synced_at !== undefined
      ? input.doc_synced_at
      : existing?.doc_synced_at ?? null;

  await dbRun(`INSERT INTO master_cover_letter (user_id, doc_id, doc_layout, doc_synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         doc_id = excluded.doc_id,
         doc_layout = excluded.doc_layout,
         doc_synced_at = excluded.doc_synced_at`, uid,
      doc_id,
      toJsonText(doc_layout),
      doc_synced_at,);
}

export async function getMasterResumeRow(userId?: string): Promise<MasterResume | null> {
  const uid = await currentUserId(userId);
  const row = await dbGet("SELECT * FROM master_resume WHERE user_id = ?", uid) as Record<string, unknown> | undefined;
  return row ? mapMasterResume(row) : null;
}

export async function upsertMasterResumeRow(input: {
  content: Record<string, unknown>;
  rules?: Record<string, unknown>;
  doc_id?: string | null;
  doc_layout?: Record<string, unknown> | null;
  doc_synced_at?: string | null;
  userId?: string;
}) {
  const uid = await currentUserId(input.userId);
  const existing = await getMasterResumeRow(uid);
  const doc_id = input.doc_id !== undefined ? input.doc_id : existing?.doc_id ?? null;
  const doc_layout =
    input.doc_layout !== undefined ? input.doc_layout : existing?.doc_layout ?? null;
  const doc_synced_at =
    input.doc_synced_at !== undefined
      ? input.doc_synced_at
      : existing?.doc_synced_at ?? null;

  await dbRun(`INSERT INTO master_resume (user_id, content, rules, doc_id, doc_layout, doc_synced_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         content = excluded.content,
         rules = excluded.rules,
         doc_id = excluded.doc_id,
         doc_layout = excluded.doc_layout,
         doc_synced_at = excluded.doc_synced_at`, uid,
      toJsonText(input.content) ?? "{}",
      toJsonText(input.rules ?? { never_fabricate: true }) ?? "{}",
      doc_id,
      toJsonText(doc_layout),
      doc_synced_at,);
}

export async function getActivePromptTemplate(kind: string): Promise<PromptTemplate | null> {
  const row = await dbGet(`SELECT * FROM prompt_templates
       WHERE kind = ? AND active = 1
       ORDER BY version DESC
       LIMIT 1`, kind) as Record<string, unknown> | undefined;
  return row ? mapPromptTemplate(row) : null;
}

export async function createPromptRun(
  kind: PromptRunKind,
  target?: { entity: string; entityId: string },
  userId?: string,
): Promise<string> {
  const id = randomUUID();
  const uid = await currentUserId(userId);
  await dbRun(`INSERT INTO prompt_runs (id, user_id, kind, prompt_text, status, target_entity, target_entity_id)
       VALUES (?, ?, ?, '', 'pending', ?, ?)`, id, uid, kind, target?.entity ?? null, target?.entityId ?? null);
  return id;
}

/**
 * Create a pending prompt run, or reuse an existing open one for the same
 * application + kind. Uses a transaction advisory lock so concurrent Vercel
 * isolates cannot each insert a duplicate jd_parse / resume / cover_letter.
 */
export async function createOrReusePendingPromptRun(
  kind: PromptRunKind,
  target: { entity: string; entityId: string },
  userId?: string,
): Promise<{ id: string; existingPromptText: string | null }> {
  const sql = getSql();
  const uid = await currentUserId(userId);
  const lockKey = `${kind}:${target.entityId}`;
  return await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx<{ id: string; prompt_text: string }[]>`
      SELECT id, prompt_text
      FROM prompt_runs
      WHERE kind = ${kind}
        AND target_entity_id = ${target.entityId}
        AND status = 'pending'
        AND user_id = ${uid}
      ORDER BY exported_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;

    if (existing[0]) {
      return {
        id: existing[0].id,
        existingPromptText: existing[0].prompt_text?.trim()
          ? existing[0].prompt_text
          : null,
      };
    }

    const id = randomUUID();
    try {
      await tx`
        INSERT INTO prompt_runs (id, user_id, kind, prompt_text, status, target_entity, target_entity_id)
        VALUES (${id}, ${uid}, ${kind}, '', 'pending', ${target.entity}, ${target.entityId})
      `;
      return { id, existingPromptText: null };
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : "";
      if (code !== "23505") throw e;
      const again = await tx<{ id: string; prompt_text: string }[]>`
        SELECT id, prompt_text
        FROM prompt_runs
        WHERE kind = ${kind}
          AND target_entity_id = ${target.entityId}
          AND status = 'pending'
          AND user_id = ${uid}
        ORDER BY exported_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `;
      if (!again[0]) throw e;
      return {
        id: again[0].id,
        existingPromptText: again[0].prompt_text?.trim()
          ? again[0].prompt_text
          : null,
      };
    }
  });
}

/** Pending cold-email prompt runs for an application (may include queued batches). */
export async function listPendingPromptRunsForTarget(
  kind: PromptRunKind,
  entityId: string,
): Promise<Array<{ id: string; prompt_text: string }>> {
  const rows = (await dbAll(
    `SELECT id, prompt_text FROM prompt_runs
     WHERE kind = ? AND target_entity_id = ? AND status = 'pending'
       AND prompt_text IS NOT NULL AND prompt_text <> ''
     ORDER BY exported_at ASC NULLS LAST, created_at ASC`,
    kind,
    entityId,
  )) as Array<{ id: string; prompt_text: string }>;
  return rows;
}

export async function updatePromptRunText(id: string, promptText: string) {
  await dbRun(`UPDATE prompt_runs SET prompt_text = ? WHERE id = ? AND status = 'pending'`, promptText, id);
}

export async function getPromptRunById(id: string): Promise<PromptRun | null> {
  const row = await dbGet("SELECT * FROM prompt_runs WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapPromptRun(row) : null;
}

export async function updatePromptRunValidationErrors(
  id: string,
  errors: unknown[],
  rawResponse?: string,
) {
  await dbRun(`UPDATE prompt_runs
       SET validation_errors = ?, raw_response = COALESCE(?, raw_response)
       WHERE id = ? AND status = 'pending'`, JSON.stringify(errors), rawResponse ?? null, id);
}

export async function completePromptRun(
  id: string,
  rawResponse: string,
  parsedResponse: Record<string, unknown>,
): Promise<boolean> {
  const result = await dbRun(`UPDATE prompt_runs
       SET status = 'completed',
           raw_response = ?,
           parsed_response = ?,
           validation_errors = NULL,
           completed_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE id = ? AND status = 'pending'`, rawResponse, JSON.stringify(parsedResponse), id);
  return result.changes > 0;
}

export async function abandonPromptRunRow(id: string) {
  await dbRun(`UPDATE prompt_runs SET status = 'abandoned' WHERE id = ? AND status = 'pending'`, id);
}

/** Abandon every pending prompt run and close related extension wake rows. */
export async function abandonAllPendingPromptRuns(userId?: string): Promise<number> {
  const uid = await currentUserId(userId);
  const before = await dbGet<{ n: number | string }>(
    `SELECT COUNT(*)::int AS n FROM prompt_runs WHERE status = 'pending' AND user_id = ?`,
    uid,
  );
  await dbRun(
    `UPDATE prompt_runs
       SET status = 'abandoned'
       WHERE status = 'pending' AND user_id = ?`,
    uid,
  );
  await dbRun(
    `UPDATE pending_extension_runs
       SET status = 'completed',
           wake_until = NULL,
           error = 'cleared',
           updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE status IN ('pending', 'claimed')
         AND prompt_run_id IN (
           SELECT id FROM prompt_runs WHERE user_id = ?
         )`,
    uid,
  );
  return Number(before?.n ?? 0);
}

export async function listRecentPromptRuns(
  limit = 10,
  userId?: string,
): Promise<PromptRun[]> {
  const uid = await currentUserId(userId);
  const rows = await dbAll(
    `SELECT * FROM prompt_runs WHERE user_id = ? ORDER BY exported_at DESC LIMIT ?`,
    uid,
    limit,
  ) as Record<string, unknown>[];
  return rows.map(mapPromptRun);
}

export async function hasCompletedDemoPrompt(userId?: string): Promise<boolean> {
  const uid = await currentUserId(userId);
  const row = await dbGet(`SELECT 1 AS ok FROM prompt_runs
       WHERE kind = 'hello_world' AND status = 'completed' AND user_id = ?
       LIMIT 1`, uid);
  return Boolean(row);
}

export async function getGoogleTokensRow(userId?: string): Promise<GoogleTokensRow | null> {
  const uid = await currentUserId(userId);
  const row = await dbGet("SELECT * FROM google_tokens WHERE user_id = ?", uid) as Record<string, unknown> | undefined;
  return row ? mapGoogleTokens(row) : null;
}

export async function saveGoogleTokensRow(input: {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  scope: string;
  expires_at: string;
  userId?: string;
}) {
  const uid = await currentUserId(input.userId);
  await dbRun(`INSERT INTO google_tokens (
         user_id, encrypted_access_token, encrypted_refresh_token, scope, expires_at, status
       ) VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT (user_id) DO UPDATE SET
         encrypted_access_token = excluded.encrypted_access_token,
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         scope = excluded.scope,
         expires_at = excluded.expires_at,
         status = 'active'`, uid,
      input.encrypted_access_token,
      input.encrypted_refresh_token,
      input.scope,
      input.expires_at,);
}

export async function markGoogleTokensRevokedRow(userId?: string) {
  const uid = await currentUserId(userId);
  await dbRun(`UPDATE google_tokens SET status = 'revoked' WHERE user_id = ?`, uid);
}

export async function deleteGoogleTokensRow(userId?: string) {
  const uid = await currentUserId(userId);
  await dbRun("DELETE FROM google_tokens WHERE user_id = ?", uid);
}

export async function insertAuditLog(input: {
  action: string;
  entity?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
  userId?: string | null;
}) {
  let uid: string | null;
  if (input.userId !== undefined) {
    uid = input.userId;
  } else {
    try {
      uid = await currentUserId();
    } catch {
      uid = null;
    }
  }
  await dbRun(`INSERT INTO audit_log (id, user_id, action, entity, entity_id, payload)
       VALUES (?, ?, ?, ?, ?, ?)`, randomUUID(),
      uid,
      input.action,
      input.entity ?? null,
      input.entity_id ?? null,
      input.payload ? JSON.stringify(input.payload) : null,);
}

export async function listRecentAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  const rows = await dbAll(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`, limit) as Record<string, unknown>[];
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

export async function insertApplication(input: {
  company?: string | null;
  role?: string | null;
  job_url?: string | null;
  jd_raw: string;
  notes?: string | null;
  email_instructions?: string | null;
  userId?: string;
}): Promise<string> {
  const id = randomUUID();
  const uid = await currentUserId(input.userId);
  await dbRun(`INSERT INTO applications (id, user_id, company, role, job_url, jd_raw, notes, email_instructions, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`, id,
      uid,
      input.company?.trim() || null,
      input.role?.trim() || null,
      input.job_url?.trim() || null,
      input.jd_raw,
      input.notes?.trim() || null,
      input.email_instructions?.trim() || null,);
  return id;
}

export async function getApplicationById(
  id: string,
  userId?: string,
): Promise<Application | null> {
  const uid = await currentUserId(userId);
  const row = await dbGet(
    "SELECT * FROM applications WHERE id = ? AND user_id = ?",
    id,
    uid,
  ) as Record<string, unknown> | undefined;
  return row ? mapApplication(row) : null;
}

/** Unscoped lookup for extension/internal paths that already authorized ownership. */
export async function getApplicationByIdUnsafe(id: string): Promise<Application | null> {
  const row = await dbGet("SELECT * FROM applications WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapApplication(row) : null;
}

export async function listApplications(
  limit = 100,
  userId?: string,
): Promise<Application[]> {
  const uid = await currentUserId(userId);
  const rows = await dbAll(
    `SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    uid,
    limit,
  ) as Record<string, unknown>[];
  return rows.map(mapApplication);
}

export async function assertApplicationOwned(
  applicationId: string,
  userId?: string,
): Promise<Application> {
  const app = await getApplicationById(applicationId, userId);
  if (!app) throw new Error("Application not found.");
  return app;
}

export async function updateApplicationStatusRow(
  id: string,
  status: ApplicationStatus,
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  const result = await dbRun(
    `UPDATE applications SET status = ? WHERE id = ? AND user_id = ?`,
    status,
    id,
    uid,
  );
  return result.changes > 0;
}

export async function updateApplicationJdParsed(
  id: string,
  jdParsed: JdParsed,
  meta?: { company?: string; role?: string },
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  const result = await dbRun(`UPDATE applications
       SET jd_parsed = ?,
           company = COALESCE(?, company),
           role = COALESCE(?, role)
       WHERE id = ? AND user_id = ?`, JSON.stringify(jdParsed),
      meta?.company?.trim() || null,
      meta?.role?.trim() || null,
      id,
      uid,);
  return result.changes > 0;
}

export async function listApplicationStatusTransitions(applicationId: string) {
  const rows = await dbAll(`SELECT action, payload, created_at
       FROM audit_log
       WHERE entity = 'applications' AND entity_id = ?
         AND action = 'application.status_changed'
       ORDER BY created_at ASC`, applicationId) as Record<string, unknown>[];
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

export async function getNextResumeVersionNumber(applicationId: string): Promise<number> {
  const row = await dbGet(`SELECT MAX(version) AS max_version FROM resume_versions WHERE application_id = ?`, applicationId) as { max_version: number | null };
  return (row.max_version ?? 0) + 1;
}

export async function insertResumeVersion(input: {
  id: string;
  application_id: string;
  version: number;
  content: Record<string, unknown>;
  prompt_run_id: string;
  status?: ResumeVersionStatus;
}): Promise<void> {
  await dbRun(`INSERT INTO resume_versions (id, application_id, version, content, prompt_run_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`, input.id,
      input.application_id,
      input.version,
      JSON.stringify(input.content),
      input.prompt_run_id,
      input.status ?? "uploading",);
}

export async function updateResumeVersionDriveIds(
  id: string,
  drivePdfId: string | null,
  driveDocxId: string | null,
  driveDocId?: string | null,
): Promise<void> {
  await dbRun(`UPDATE resume_versions
       SET drive_pdf_id = ?, drive_docx_id = ?, drive_doc_id = ?, status = 'ready'
       WHERE id = ?`, drivePdfId, driveDocxId, driveDocId ?? null, id);
}

export async function markResumeVersionUploadFailed(id: string): Promise<void> {
  await dbRun(`UPDATE resume_versions SET status = 'upload_failed' WHERE id = ?`, id);
}

export async function updateResumeVersionContentForRetry(
  id: string,
  content: Record<string, unknown> | object,
): Promise<void> {
  await dbRun(`UPDATE resume_versions
       SET content = ?, status = 'uploading'
       WHERE id = ?`, JSON.stringify(content), id);
}

export async function getResumeVersion(
  applicationId: string,
  version: number,
): Promise<ResumeVersion | null> {
  const row = await dbGet(`SELECT * FROM resume_versions WHERE application_id = ? AND version = ?`, applicationId, version) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

export async function listResumeVersions(applicationId: string): Promise<ResumeVersion[]> {
  const rows = await dbAll(`SELECT * FROM resume_versions WHERE application_id = ? ORDER BY version DESC`, applicationId) as Record<string, unknown>[];
  return rows.map(mapResumeVersion);
}

export async function getResumeVersionById(id: string): Promise<ResumeVersion | null> {
  const row = await dbGet("SELECT * FROM resume_versions WHERE id = ?", id) as Record<string, unknown> | undefined;
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

export async function getNextCoverLetterVersionNumber(applicationId: string): Promise<number> {
  const row = await dbGet(`SELECT MAX(version) AS max_version FROM cover_letter_versions WHERE application_id = ?`, applicationId) as { max_version: number | null };
  return (row.max_version ?? 0) + 1;
}

export async function insertCoverLetterVersion(input: {
  id: string;
  application_id: string;
  resume_version_id?: string | null;
  version: number;
  content: Record<string, unknown>;
  prompt_run_id?: string | null;
  edited_from_version_id?: string | null;
  status?: CoverLetterVersionStatus;
}): Promise<void> {
  await dbRun(`INSERT INTO cover_letter_versions (
         id, application_id, resume_version_id, version, content,
         prompt_run_id, edited_from_version_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, input.id,
      input.application_id,
      input.resume_version_id ?? null,
      input.version,
      JSON.stringify(input.content),
      input.prompt_run_id ?? null,
      input.edited_from_version_id ?? null,
      input.status ?? "uploading",);
}

export async function updateCoverLetterVersionDriveIds(
  id: string,
  drivePdfId: string | null,
  driveDocxId: string | null,
  driveDocId?: string | null,
): Promise<void> {
  await dbRun(`UPDATE cover_letter_versions
       SET drive_pdf_id = ?, drive_docx_id = ?, drive_doc_id = ?, status = 'ready'
       WHERE id = ?`, drivePdfId, driveDocxId, driveDocId ?? null, id);
}

export async function markCoverLetterVersionUploadFailed(id: string): Promise<void> {
  await dbRun(`UPDATE cover_letter_versions SET status = 'upload_failed' WHERE id = ?`, id);
}

export async function updateCoverLetterVersionContentForRetry(
  id: string,
  content: Record<string, unknown> | object,
): Promise<void> {
  await dbRun(`UPDATE cover_letter_versions
       SET content = ?, status = 'uploading'
       WHERE id = ?`, JSON.stringify(content), id);
}

export async function listCoverLetterVersions(
  applicationId: string,
): Promise<CoverLetterVersion[]> {
  const rows = await dbAll(`SELECT * FROM cover_letter_versions WHERE application_id = ? ORDER BY version DESC`, applicationId) as Record<string, unknown>[];
  return rows.map(mapCoverLetterVersion);
}

export async function getCoverLetterVersion(
  applicationId: string,
  version: number,
): Promise<CoverLetterVersion | null> {
  const row = await dbGet(`SELECT * FROM cover_letter_versions WHERE application_id = ? AND version = ?`, applicationId, version) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

export async function getCoverLetterVersionById(id: string): Promise<CoverLetterVersion | null> {
  const row = await dbGet("SELECT * FROM cover_letter_versions WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

export async function updateApplicationCompanyBlurb(
  id: string,
  companyBlurb: string | null,
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  const result = await dbRun(
    `UPDATE applications SET company_blurb = ? WHERE id = ? AND user_id = ?`,
    companyBlurb?.trim() || null,
    id,
    uid,
  );
  return result.changes > 0;
}

export async function updateApplicationEmailInstructions(
  id: string,
  emailInstructions: string | null,
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  const result = await dbRun(
    `UPDATE applications SET email_instructions = ? WHERE id = ? AND user_id = ?`,
    emailInstructions?.trim() || null,
    id,
    uid,
  );
  return result.changes > 0;
}

export async function getLatestReadyResumeVersion(
  applicationId: string,
): Promise<ResumeVersion | null> {
  const row = await dbGet(`SELECT * FROM resume_versions
       WHERE application_id = ? AND status = 'ready'
       ORDER BY version DESC
       LIMIT 1`, applicationId) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

/** Latest resume with accepted content (Drive may still be uploading). */
export async function getLatestUsableResumeVersion(
  applicationId: string,
): Promise<ResumeVersion | null> {
  const row = await dbGet(
    `SELECT * FROM resume_versions
       WHERE application_id = ? AND status IN ('ready', 'uploading')
       ORDER BY
         CASE status WHEN 'ready' THEN 0 WHEN 'uploading' THEN 1 ELSE 2 END,
         version DESC
       LIMIT 1`,
    applicationId,
  ) as Record<string, unknown> | undefined;
  return row ? mapResumeVersion(row) : null;
}

export async function getLatestReadyCoverLetterVersion(
  applicationId: string,
): Promise<CoverLetterVersion | null> {
  const row = await dbGet(`SELECT * FROM cover_letter_versions
       WHERE application_id = ? AND status = 'ready'
       ORDER BY version DESC
       LIMIT 1`, applicationId) as Record<string, unknown> | undefined;
  return row ? mapCoverLetterVersion(row) : null;
}

/** Latest cover letter with accepted content (Drive may still be uploading). */
export async function getLatestUsableCoverLetterVersion(
  applicationId: string,
): Promise<CoverLetterVersion | null> {
  const row = await dbGet(
    `SELECT * FROM cover_letter_versions
       WHERE application_id = ? AND status IN ('ready', 'uploading')
       ORDER BY
         CASE status WHEN 'ready' THEN 0 WHEN 'uploading' THEN 1 ELSE 2 END,
         version DESC
       LIMIT 1`,
    applicationId,
  ) as Record<string, unknown> | undefined;
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

export async function listContacts(applicationId: string): Promise<Contact[]> {
  const rows = await dbAll(`SELECT * FROM contacts WHERE application_id = ? ORDER BY created_at DESC`, applicationId) as Record<string, unknown>[];
  return rows.map(mapContact);
}

export async function getContactById(id: string): Promise<Contact | null> {
  const row = await dbGet("SELECT * FROM contacts WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapContact(row) : null;
}

export async function insertContact(input: {
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
}): Promise<string> {
  const id = randomUUID();
  await dbRun(`INSERT INTO contacts (
         id, application_id, name, role, linkedin_url, company_domain,
         email, email_confidence, email_source, verification_status, notes, prompt_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id,
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
      input.prompt_run_id ?? null,);
  return id;
}

export async function deleteContact(id: string): Promise<boolean> {
  const result = await dbRun("DELETE FROM contacts WHERE id = ?", id);
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
    gmail_thread_id: (row.gmail_thread_id as string | null) ?? null,
    gmail_rfc_message_id: (row.gmail_rfc_message_id as string | null) ?? null,
    draft_status: row.draft_status as DraftStatus,
    draft_error: (row.draft_error as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listEmails(applicationId: string): Promise<EmailRecord[]> {
  const rows = await dbAll(`SELECT * FROM emails WHERE application_id = ? ORDER BY created_at DESC`, applicationId) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export async function getEmailById(id: string): Promise<EmailRecord | null> {
  const row = await dbGet("SELECT * FROM emails WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapEmail(row) : null;
}

export async function listEmailsByIds(ids: string[]): Promise<EmailRecord[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await dbAll(`SELECT * FROM emails WHERE id IN (${placeholders})`, ...ids) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export async function listEmailsByPromptRun(promptRunId: string): Promise<EmailRecord[]> {
  const rows = await dbAll(`SELECT * FROM emails WHERE prompt_run_id = ? ORDER BY created_at ASC`, promptRunId) as Record<string, unknown>[];
  return rows.map(mapEmail);
}

export async function insertEmail(input: {
  application_id: string;
  contact_id: string;
  kind?: EmailKind;
  subject: string;
  body_md: string;
  body_html: string;
  role_template?: ColdEmailRoleTemplate | null;
  prompt_run_id?: string | null;
  draft_status?: DraftStatus;
}): Promise<string> {
  const kind = input.kind ?? "cold";
  // One cold email per contact per application - never create duplicates.
  if (kind === "cold") {
    const existing = await dbGet<{ id: string }>(
      `SELECT id FROM emails
         WHERE application_id = ? AND contact_id = ? AND kind = 'cold'
         LIMIT 1`,
      input.application_id,
      input.contact_id,
    );
    if (existing?.id) return existing.id;
  }

  const id = randomUUID();
  await dbRun(
    `INSERT INTO emails (
         id, application_id, contact_id, kind, subject, body_md, body_html,
         role_template, prompt_run_id, draft_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.application_id,
    input.contact_id,
    kind,
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
export async function claimEmailForDraftCreation(id: string): Promise<boolean> {
  // Use RETURNING - postgres.js count can be unreliable for UPDATE without it.
  const row = await dbGet<{ id: string }>(
    `UPDATE emails
       SET draft_status = 'creating', draft_error = NULL
       WHERE id = ? AND draft_status IN ('pending', 'failed', 'deleted_externally')
       RETURNING id`,
    id,
  );
  return Boolean(row?.id);
}

export async function markEmailDraftCreated(
  id: string,
  gmailDraftId: string,
  gmailMessageId?: string | null,
  threadMeta?: {
    gmail_thread_id?: string | null;
    gmail_rfc_message_id?: string | null;
  },
): Promise<boolean> {
  const row = await dbGet<{ id: string }>(
    `UPDATE emails
       SET draft_status = 'created',
           gmail_draft_id = ?,
           gmail_message_id = ?,
           gmail_thread_id = COALESCE(?, gmail_thread_id),
           gmail_rfc_message_id = COALESCE(?, gmail_rfc_message_id),
           draft_error = NULL
       WHERE id = ? AND draft_status = 'creating'
       RETURNING id`,
    gmailDraftId,
    gmailMessageId ?? null,
    threadMeta?.gmail_thread_id ?? null,
    threadMeta?.gmail_rfc_message_id ?? null,
    id,
  );
  return Boolean(row?.id);
}

export async function updateEmailThreadMetadata(
  id: string,
  gmailThreadId: string,
  gmailRfcMessageId: string,
): Promise<boolean> {
  const result = await dbRun(
    `UPDATE emails
       SET gmail_thread_id = ?,
           gmail_rfc_message_id = ?
       WHERE id = ?`,
    gmailThreadId,
    gmailRfcMessageId,
    id,
  );
  return result.changes > 0;
}

export async function markEmailDraftFailed(id: string, error: string): Promise<boolean> {
  const result = await dbRun(`UPDATE emails
       SET draft_status = 'failed', draft_error = ?
       WHERE id = ?`, error.slice(0, 500), id);
  return result.changes > 0;
}

export async function markEmailDraftDeletedExternally(id: string): Promise<boolean> {
  const result = await dbRun(`UPDATE emails
       SET draft_status = 'deleted_externally',
           gmail_draft_id = NULL,
           gmail_message_id = NULL
       WHERE id = ?`, id);
  return result.changes > 0;
}

export async function updateEmailContent(
  id: string,
  input: { subject?: string; body_md?: string; body_html?: string },
): Promise<boolean> {
  const existing = await getEmailById(id);
  if (!existing) return false;
  const result = await dbRun(`UPDATE emails
       SET subject = ?, body_md = ?, body_html = ?
       WHERE id = ?`, input.subject ?? existing.subject,
      input.body_md ?? existing.body_md,
      input.body_html ?? existing.body_html,
      id,);
  return result.changes > 0;
}

export async function resetEmailDraftForRecreate(id: string): Promise<boolean> {
  const result = await dbRun(`UPDATE emails
       SET draft_status = 'pending',
           gmail_draft_id = NULL,
           gmail_message_id = NULL,
           draft_error = NULL
       WHERE id = ?`, id);
  return result.changes > 0;
}
