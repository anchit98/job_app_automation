import { dbGet, dbAll, dbRun } from "@/lib/db";
import type { Application, PromptRun } from "@/lib/db/types";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";
import { isApplicationStatus } from "@/lib/applications/status";
import {
  buildFtsMatchQuery,
  type ApplicationListItem,
  type ApplicationSearchFilters,
  type ApplicationSearchResult,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/tracker/search";
import {
  labelForAuditAction,
  labelForPromptKind,
  statusChangeDetail,
  type TimelineEvent,
} from "@/lib/tracker/timeline";
import { isLikelyDuplicate } from "@/lib/tracker/duplicates";
import type { DashboardMetricsRow } from "@/lib/tracker/metrics";

async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromAls = getRequestUserId();
  if (fromAls) return fromAls;
  return (await requireUser()).id;
}
function mapApplicationRow(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    company: (row.company as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    job_url: (row.job_url as string | null) ?? null,
    jd_raw: row.jd_raw as string,
    jd_parsed: row.jd_parsed
      ? (JSON.parse(row.jd_parsed as string) as Application["jd_parsed"])
      : null,
    status: row.status as Application["status"],
    notes: (row.notes as string | null) ?? null,
    notes_html: (row.notes_html as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    company_blurb: (row.company_blurb as string | null) ?? null,
    email_instructions: (row.email_instructions as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapPromptRun(row: Record<string, unknown>): PromptRun {
  return {
    id: row.id as string,
    kind: row.kind as PromptRun["kind"],
    prompt_text: row.prompt_text as string,
    target_entity: (row.target_entity as string | null) ?? null,
    target_entity_id: (row.target_entity_id as string | null) ?? null,
    status: row.status as PromptRun["status"],
    exported_at: row.exported_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    raw_response: (row.raw_response as string | null) ?? null,
    parsed_response: row.parsed_response
      ? (JSON.parse(row.parsed_response as string) as Record<string, unknown>)
      : null,
    validation_errors: row.validation_errors
      ? (JSON.parse(row.validation_errors as string) as unknown[])
      : null,
  };
}

export async function searchApplications(
  filters: ApplicationSearchFilters,
  userId?: string,
): Promise<ApplicationSearchResult> {
  const uid = await currentUserId(userId);
  const page = filters.page ?? 1;
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["a.user_id = ?"];
  const params: unknown[] = [uid];

  const ftsQuery = filters.q ? buildFtsMatchQuery(filters.q) : "";
  if (ftsQuery) {
    conditions.push(
      `(to_tsvector('english', coalesce(a.company,'') || ' ' || coalesce(a.role,'') || ' ' || coalesce(a.jd_raw,'') || ' ' || coalesce(a.notes,'')) @@ plainto_tsquery('english', ?))`,
    );
    params.push(ftsQuery);
  }

  if (filters.status === "interview_stage") {
    conditions.push(
      `a.status IN ('hr_replied', 'interview_scheduled', 'offer', 'accepted')`,
    );
  } else if (filters.status && isApplicationStatus(filters.status)) {
    conditions.push(`a.status = ?`);
    params.push(filters.status);
  }

  if (filters.company?.trim()) {
    conditions.push(`LOWER(COALESCE(a.company, '')) LIKE ?`);
    params.push(`%${filters.company.trim().toLowerCase()}%`);
  }

  if (filters.role?.trim()) {
    conditions.push(`LOWER(COALESCE(a.role, '')) LIKE ?`);
    params.push(`%${filters.role.trim().toLowerCase()}%`);
  }

  if (filters.contact?.trim()) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM contacts c
        WHERE c.application_id = a.id
          AND (
            LOWER(COALESCE(c.name, '')) LIKE ?
            OR LOWER(COALESCE(c.email, '')) LIKE ?
          )
      )`,
    );
    const term = `%${filters.contact.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  if (filters.dateFrom) {
    conditions.push(`(a.created_at::timestamptz)::date >= ?::date`);
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`(a.created_at::timestamptz)::date <= ?::date`);
    params.push(filters.dateTo);
  }

  const where = conditions.join(" AND ");

  const countRow = await dbGet(`SELECT COUNT(*) AS total FROM applications a WHERE ${where}`, ...params) as { total: number };

  const rows = await dbAll(`SELECT
         a.*,
         (SELECT COUNT(*) FROM resume_versions rv WHERE rv.application_id = a.id) AS resume_version_count,
         (SELECT MAX(rv.version) FROM resume_versions rv
          WHERE rv.application_id = a.id AND rv.status = 'ready') AS latest_resume_version
       FROM applications a
       WHERE ${where}
       ORDER BY a.updated_at DESC
       LIMIT ? OFFSET ?`, ...params, pageSize, offset) as Record<string, unknown>[];

  const items: ApplicationListItem[] = rows.map((row) => {
    const resumeCount = Number(row.resume_version_count ?? 0);
    const status = row.status as ApplicationListItem["status"];
    return {
      id: row.id as string,
      company: (row.company as string | null) ?? null,
      role: (row.role as string | null) ?? null,
      status,
      jd_parsed: Boolean(row.jd_parsed),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      resume_version_count: resumeCount,
      latest_resume_version:
        row.latest_resume_version != null
          ? Number(row.latest_resume_version)
          : null,
      is_incomplete: status === "applied" && resumeCount === 0,
    };
  });

  const total = Number(countRow?.total ?? 0);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDashboardMetricsRow(
  userId?: string,
): Promise<DashboardMetricsRow> {
  const uid = await currentUserId(userId);
  const row = await dbGet(`SELECT
         (SELECT COUNT(*) FROM applications WHERE user_id = ?) AS total,
         (SELECT COUNT(*) FROM applications
          WHERE user_id = ?
            AND created_at >= (NOW() AT TIME ZONE 'utc' - INTERVAL '7 days')::text) AS this_week,
         (SELECT COUNT(*) FROM applications
          WHERE user_id = ?
            AND status IN (
            'applied', 'email_sent', 'hr_replied', 'interview_scheduled',
            'offer', 'accepted', 'rejected', 'withdrawn'
          )) AS applied_denominator,
         (SELECT COUNT(*) FROM applications
          WHERE user_id = ?
            AND status IN ('hr_replied', 'interview_scheduled', 'offer', 'accepted')) AS responded,
         (SELECT COUNT(*) FROM applications
          WHERE user_id = ?
            AND status IN ('interview_scheduled', 'offer', 'accepted')) AS interviewed,
         (SELECT COUNT(*) FROM applications
          WHERE user_id = ?
            AND status IN ('offer', 'accepted')) AS offered,
         (SELECT COUNT(DISTINCT company) FROM applications
          WHERE user_id = ?
            AND status IN ('email_sent', 'hr_replied', 'interview_scheduled', 'offer', 'accepted')
            AND company IS NOT NULL AND TRIM(company) != '') AS companies_contacted,
         (SELECT COUNT(*) FROM emails e
          INNER JOIN applications a ON a.id = e.application_id
          WHERE a.user_id = ? AND e.draft_status = 'created') AS emails_sent,
         (SELECT COUNT(*) FROM prompt_runs
          WHERE user_id = ? AND status = 'pending' AND prompt_text != '') AS pending_prompts,
         (SELECT COUNT(*) FROM follow_ups f
          INNER JOIN applications a ON a.id = f.application_id
          WHERE a.user_id = ?
            AND f.status IN ('pending', 'enqueued', 'processing', 'snoozed')
            AND f.status != 'skipped') AS pending_follow_ups,
         (SELECT COUNT(*) FROM follow_ups f
          INNER JOIN applications a ON a.id = f.application_id
          WHERE a.user_id = ? AND f.status = 'snoozed') AS snoozed_follow_ups,
         (SELECT COUNT(*) FROM applications a
          WHERE a.user_id = ?
            AND a.status = 'applied'
            AND NOT EXISTS (
              SELECT 1 FROM resume_versions rv WHERE rv.application_id = a.id
            )) AS incomplete_applied`,
    uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid);
  return row as unknown as DashboardMetricsRow;
}

export interface PendingPromptRunItem extends PromptRun {
  application_id: string | null;
  application_company: string | null;
  application_role: string | null;
}

export async function listPendingPromptRuns(
  userId?: string,
): Promise<PendingPromptRunItem[]> {
  const uid = await currentUserId(userId);
  const rows = await dbAll(`SELECT pr.*,
         COALESCE(a.company, a2.company) AS application_company,
         COALESCE(a.role, a2.role) AS application_role,
         COALESCE(
           CASE WHEN pr.target_entity = 'applications' THEN pr.target_entity_id END,
           fu.application_id
         ) AS application_id
       FROM prompt_runs pr
       LEFT JOIN applications a
         ON pr.target_entity = 'applications' AND pr.target_entity_id = a.id
       LEFT JOIN follow_ups fu
         ON pr.target_entity = 'follow_ups' AND pr.target_entity_id = fu.id
       LEFT JOIN applications a2 ON fu.application_id = a2.id
       WHERE pr.user_id = ?
         AND pr.status = 'pending'
         AND TRIM(pr.prompt_text) != ''
       ORDER BY
         CASE pr.kind
           WHEN 'follow_up' THEN 1
           WHEN 'cold_email' THEN 2
           WHEN 'email_discovery' THEN 3
           WHEN 'resume' THEN 4
           WHEN 'cover_letter' THEN 5
           WHEN 'jd_parse' THEN 6
           ELSE 7
         END,
         pr.exported_at ASC`, uid) as Record<string, unknown>[];

  return rows.map((row) => ({
    ...mapPromptRun(row),
    application_id: (row.application_id as string | null) ?? null,
    application_company: (row.application_company as string | null) ?? null,
    application_role: (row.application_role as string | null) ?? null,
  }));
}

export async function listApplicationTimeline(
  applicationId: string,
): Promise<TimelineEvent[]> {
  const auditRows = await dbAll(`SELECT id, action, payload, created_at
       FROM audit_log
       WHERE (entity = 'applications' AND entity_id = ?)
          OR (payload::jsonb->>'application_id') = ?
       ORDER BY created_at ASC`, applicationId, applicationId) as Record<string, unknown>[];

  const promptRows = await dbAll(`SELECT id, kind, status, exported_at, completed_at
       FROM prompt_runs
       WHERE target_entity_id = ?
       ORDER BY exported_at ASC`, applicationId) as Record<string, unknown>[];

  const events: TimelineEvent[] = [];

  for (const row of auditRows) {
    const payload = row.payload
      ? (JSON.parse(row.payload as string) as Record<string, unknown>)
      : null;
    events.push({
      id: `audit-${row.id as string}`,
      kind: "audit",
      action: row.action as string,
      label: labelForAuditAction(row.action as string),
      detail:
        row.action === "application.status_changed"
          ? statusChangeDetail(payload)
          : null,
      created_at: row.created_at as string,
    });
  }

  for (const row of promptRows) {
    const exportedAt = row.exported_at as string;
    events.push({
      id: `prompt-export-${row.id as string}`,
      kind: "prompt",
      action: "prompt.exported",
      label: labelForPromptKind(row.kind as string, "pending"),
      detail: null,
      created_at: exportedAt,
      prompt_run_id: row.id as string,
      prompt_kind: row.kind as PromptRun["kind"],
    });

    if (row.completed_at) {
      events.push({
        id: `prompt-done-${row.id as string}`,
        kind: "prompt",
        action: "prompt.completed",
        label: labelForPromptKind(row.kind as string, "completed"),
        detail: null,
        created_at: row.completed_at as string,
        prompt_run_id: row.id as string,
        prompt_kind: row.kind as PromptRun["kind"],
      });
    } else if (row.status === "abandoned") {
      events.push({
        id: `prompt-abandon-${row.id as string}`,
        kind: "prompt",
        action: "prompt.abandoned",
        label: labelForPromptKind(row.kind as string, "abandoned"),
        detail: null,
        created_at: exportedAt,
        prompt_run_id: row.id as string,
        prompt_kind: row.kind as PromptRun["kind"],
      });
    }
  }

  events.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return events;
}

export async function findSimilarApplications(
  company: string | null | undefined,
  role: string | null | undefined,
  excludeId?: string,
  userId?: string,
): Promise<Application[]> {
  const uid = await currentUserId(userId);
  // Avoid `? IS NULL` — Postgres cannot infer the type of a null parameter.
  const rows = (
    excludeId
      ? await dbAll(
          `SELECT * FROM applications
           WHERE user_id = ? AND id != ?
           ORDER BY updated_at DESC
           LIMIT 50`,
          uid,
          excludeId,
        )
      : await dbAll(
          `SELECT * FROM applications
           WHERE user_id = ?
           ORDER BY updated_at DESC
           LIMIT 50`,
          uid,
        )
  ) as Record<string, unknown>[];

  const candidate = { company, role };
  return rows
    .map(mapApplicationRow)
    .filter((app) => isLikelyDuplicate(candidate, app))
    .slice(0, 5);
}

export async function updateApplicationNotesRow(
  id: string,
  notes: string | null,
  notesHtml: string | null,
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  const result = await dbRun(
    `UPDATE applications SET notes = ?, notes_html = ? WHERE id = ? AND user_id = ?`,
    notes,
    notesHtml,
    id,
    uid,
  );
  return result.changes > 0;
}

export async function deleteApplicationRow(
  id: string,
  userId?: string,
): Promise<boolean> {
  const uid = await currentUserId(userId);
  // pipeline_runs / pending_extension_runs lack ON DELETE CASCADE — clear them first.
  await dbRun(
    `DELETE FROM pending_extension_runs
       WHERE pipeline_run_id IN (
         SELECT id FROM pipeline_runs WHERE application_id = ? AND user_id = ?
       )`,
    id,
    uid,
  );
  await dbRun(
    `DELETE FROM pipeline_runs WHERE application_id = ? AND user_id = ?`,
    id,
    uid,
  );
  const row = await dbGet<{ id: string }>(
    `DELETE FROM applications WHERE id = ? AND user_id = ? RETURNING id`,
    id,
    uid,
  );
  return Boolean(row?.id);
}
