import { randomUUID } from "crypto";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import type { FollowUp, FollowUpStatus } from "@/lib/db/types";
import {
  addBusinessDays,
  toUtcIso,
} from "@/lib/follow-ups/business-days";

function mapFollowUp(row: Record<string, unknown>): FollowUp {
  return {
    id: row.id as string,
    application_id: row.application_id as string,
    email_id: row.email_id as string,
    sequence: row.sequence as 1 | 2,
    due_at: (row.due_at as string | null) ?? null,
    status: row.status as FollowUpStatus,
    snoozed_until: (row.snoozed_until as string | null) ?? null,
    draft_email_id: (row.draft_email_id as string | null) ?? null,
    prompt_run_id: (row.prompt_run_id as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function listFollowUpsForApplication(applicationId: string): Promise<FollowUp[]> {
  const rows = await dbAll(`SELECT * FROM follow_ups
       WHERE application_id = ?
       ORDER BY email_id, sequence`, applicationId) as Record<string, unknown>[];
  return rows.map(mapFollowUp);
}

export async function getFollowUpById(id: string): Promise<FollowUp | null> {
  const row = await dbGet("SELECT * FROM follow_ups WHERE id = ?", id) as Record<string, unknown> | undefined;
  return row ? mapFollowUp(row) : null;
}

export async function getFollowUpByDraftEmailId(
  draftEmailId: string,
): Promise<FollowUp | null> {
  const row = await dbGet(
    `SELECT * FROM follow_ups WHERE draft_email_id = ? LIMIT 1`,
    draftEmailId,
  ) as Record<string, unknown> | undefined;
  return row ? mapFollowUp(row) : null;
}

export async function getFollowUpByEmailSequence(
  emailId: string,
  sequence: 1 | 2,
): Promise<FollowUp | null> {
  const row = await dbGet(`SELECT * FROM follow_ups WHERE email_id = ? AND sequence = ?`, emailId, sequence) as Record<string, unknown> | undefined;
  return row ? mapFollowUp(row) : null;
}

export async function insertFollowUp(input: {
  application_id: string;
  email_id: string;
  sequence: 1 | 2;
  due_at: string | null;
  status: FollowUpStatus;
}): Promise<string> {
  const id = randomUUID();
  await dbRun(`INSERT INTO follow_ups (
         id, application_id, email_id, sequence, due_at, status
       ) VALUES (?, ?, ?, ?, ?, ?)`, id,
      input.application_id,
      input.email_id,
      input.sequence,
      input.due_at,
      input.status,);
  return id;
}

export async function followUpsExistForEmail(emailId: string): Promise<boolean> {
  const row = await dbGet(`SELECT 1 AS ok FROM follow_ups WHERE email_id = ? LIMIT 1`, emailId);
  return Boolean(row);
}

export async function scheduleFollowUpsForColdEmail(
  applicationId: string,
  emailId: string,
  timezone: string,
  fromDate = new Date(),
): Promise<{ followUp1Id: string; followUp2Id: string }> {
  if (await followUpsExistForEmail(emailId)) {
    const existing1 = await getFollowUpByEmailSequence(emailId, 1);
    const existing2 = await getFollowUpByEmailSequence(emailId, 2);
    return {
      followUp1Id: existing1!.id,
      followUp2Id: existing2!.id,
    };
  }

  const due1 = toUtcIso(addBusinessDays(fromDate, 5, timezone));
  const followUp1Id = await insertFollowUp({
    application_id: applicationId,
    email_id: emailId,
    sequence: 1,
    due_at: due1,
    status: "pending",
  });
  const followUp2Id = await insertFollowUp({
    application_id: applicationId,
    email_id: emailId,
    sequence: 2,
    due_at: null,
    status: "waiting",
  });
  return { followUp1Id, followUp2Id };
}

export async function activateSecondFollowUp(emailId: string, timezone: string): Promise<void> {
  const second = await getFollowUpByEmailSequence(emailId, 2);
  if (!second || second.status !== "waiting") return;

  const due2 = toUtcIso(addBusinessDays(new Date(), 10, timezone));
  await dbRun(`UPDATE follow_ups
       SET status = 'pending', due_at = ?
       WHERE id = ? AND status = 'waiting'`, due2, second.id);
}

export async function claimFollowUpForProcessing(id: string): Promise<boolean> {
  const result = await dbRun(`UPDATE follow_ups
       SET status = 'processing',
           processing_started_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE id = ?
         AND status IN ('pending', 'snoozed')
         AND (due_at IS NULL OR due_at::timestamptz <= NOW())
         AND (snoozed_until IS NULL OR snoozed_until::timestamptz <= NOW())`, id);
  return result.changes > 0;
}

/** Claim for an explicit Jobs-page batch (no due-date gate). */
export async function claimFollowUpForBatch(id: string): Promise<boolean> {
  const result = await dbRun(
    `UPDATE follow_ups
       SET status = 'processing',
           processing_started_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE id = ?
         AND status IN ('pending', 'snoozed', 'enqueued')`,
    id,
  );
  return result.changes > 0;
}

export async function markFollowUpEnqueued(
  id: string,
  promptRunId: string,
): Promise<boolean> {
  const result = await dbRun(`UPDATE follow_ups
       SET status = 'enqueued',
           prompt_run_id = ?,
           processing_started_at = NULL
       WHERE id = ? AND status = 'processing'`, promptRunId, id);
  return result.changes > 0;
}

export async function releaseFollowUpProcessing(id: string): Promise<void> {
  await dbRun(
    `UPDATE follow_ups
       SET status = 'pending', processing_started_at = NULL
       WHERE id = ? AND status = 'processing'`,
    id,
  );
}

export async function updateFollowUpStatus(
  id: string,
  status: FollowUpStatus,
  extra?: {
    sent_at?: string | null;
    draft_email_id?: string | null;
    due_at?: string | null;
    snoozed_until?: string | null;
  },
): Promise<boolean> {
  const result = await dbRun(`UPDATE follow_ups
       SET status = ?,
           sent_at = COALESCE(?, sent_at),
           draft_email_id = COALESCE(?, draft_email_id),
           due_at = COALESCE(?, due_at),
           snoozed_until = COALESCE(?, snoozed_until)
       WHERE id = ?`, status,
      extra?.sent_at ?? null,
      extra?.draft_email_id ?? null,
      extra?.due_at ?? null,
      extra?.snoozed_until ?? null,
      id,);
  return result.changes > 0;
}

export async function listDueFollowUps(limit = 20): Promise<FollowUp[]> {
  const rows = await dbAll(`SELECT fu.*
       FROM follow_ups fu
       INNER JOIN emails e ON e.id = fu.email_id
       INNER JOIN applications a ON a.id = fu.application_id
       WHERE fu.status IN ('pending', 'snoozed')
         AND fu.due_at IS NOT NULL
         AND fu.due_at::timestamptz <= NOW()
         AND (fu.snoozed_until IS NULL OR fu.snoozed_until::timestamptz <= NOW())
         AND a.status NOT IN ('hr_replied', 'interview_scheduled', 'offer', 'accepted', 'rejected', 'withdrawn')
         AND (
           fu.sequence = 1
           OR (
             fu.sequence = 2
             AND EXISTS (
               SELECT 1 FROM follow_ups f1
               WHERE f1.email_id = fu.email_id
                 AND f1.sequence = 1
                 AND f1.status IN ('sent', 'skipped')
             )
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM follow_ups fx
           WHERE fx.email_id = fu.email_id
             AND fx.sequence < fu.sequence
             AND fx.status NOT IN ('sent', 'skipped')
         )
         AND NOT EXISTS (
           SELECT 1 FROM follow_ups fe
           WHERE fe.email_id = fu.email_id
             AND fe.status IN ('enqueued', 'processing')
         )
       ORDER BY fu.due_at ASC
       LIMIT ?`, limit) as Record<string, unknown>[];

  return rows.map(mapFollowUp);
}

/**
 * All runnable follow-ups for one application at a given sequence
 * (pending / snoozed / processing / enqueued, not waiting/sent/skipped).
 * Used to fan out one GPT body to every contact.
 */
export async function listRunnableFollowUpsForApplication(
  applicationId: string,
  sequence: 1 | 2,
): Promise<FollowUp[]> {
  const rows = (await dbAll(
    `SELECT fu.*
     FROM follow_ups fu
     INNER JOIN emails e ON e.id = fu.email_id
     INNER JOIN contacts c ON c.id = e.contact_id
     WHERE fu.application_id = ?
       AND fu.sequence = ?
       AND fu.status IN ('pending', 'snoozed', 'processing', 'enqueued')
       AND c.email IS NOT NULL
       AND TRIM(c.email) <> ''
     ORDER BY fu.due_at ASC NULLS LAST, fu.created_at ASC`,
    applicationId,
    sequence,
  )) as Record<string, unknown>[];
  return rows.map(mapFollowUp);
}

/** Earliest due follow-up per application, only when the email has a contact with an address. */
export async function getDueFollowUpsByApplicationIds(
  applicationIds: string[],
): Promise<
  Record<
    string,
    {
      id: string;
      sequence: 1 | 2;
      due_at: string;
      contact_name: string | null;
    }
  >
> {
  if (applicationIds.length === 0) return {};

  const placeholders = applicationIds.map(() => "?").join(", ");
  const rows = (await dbAll(
    `SELECT DISTINCT ON (fu.application_id)
        fu.id,
        fu.application_id,
        fu.sequence,
        fu.due_at,
        c.name AS contact_name
     FROM follow_ups fu
     INNER JOIN emails e ON e.id = fu.email_id
     INNER JOIN contacts c ON c.id = e.contact_id
     INNER JOIN applications a ON a.id = fu.application_id
     WHERE fu.application_id IN (${placeholders})
       AND c.email IS NOT NULL
       AND TRIM(c.email) <> ''
       AND fu.status IN ('pending', 'snoozed')
       AND fu.due_at IS NOT NULL
       AND fu.due_at::timestamptz <= NOW()
       AND (fu.snoozed_until IS NULL OR fu.snoozed_until::timestamptz <= NOW())
       AND a.status NOT IN ('hr_replied', 'interview_scheduled', 'offer', 'accepted', 'rejected', 'withdrawn')
       AND (
         fu.sequence = 1
         OR (
           fu.sequence = 2
           AND EXISTS (
             SELECT 1 FROM follow_ups f1
             WHERE f1.email_id = fu.email_id
               AND f1.sequence = 1
               AND f1.status IN ('sent', 'skipped')
           )
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM follow_ups fx
         WHERE fx.email_id = fu.email_id
           AND fx.sequence < fu.sequence
           AND fx.status NOT IN ('sent', 'skipped')
       )
       AND NOT EXISTS (
         SELECT 1 FROM follow_ups fe
         WHERE fe.email_id = fu.email_id
           AND fe.status IN ('enqueued', 'processing')
       )
     ORDER BY fu.application_id, fu.due_at ASC`,
    ...applicationIds,
  )) as Record<string, unknown>[];

  const out: Record<
    string,
    {
      id: string;
      sequence: 1 | 2;
      due_at: string;
      contact_name: string | null;
    }
  > = {};
  for (const row of rows) {
    out[row.application_id as string] = {
      id: row.id as string,
      sequence: row.sequence as 1 | 2,
      due_at: row.due_at as string,
      contact_name: (row.contact_name as string | null) ?? null,
    };
  }
  return out;
}

export async function getApplicationsWithContacts(
  applicationIds: string[],
): Promise<Set<string>> {
  if (applicationIds.length === 0) return new Set();
  const placeholders = applicationIds.map(() => "?").join(", ");
  const rows = (await dbAll(
    `SELECT DISTINCT application_id
     FROM contacts
     WHERE application_id IN (${placeholders})
       AND email IS NOT NULL
       AND TRIM(email) <> ''`,
    ...applicationIds,
  )) as { application_id: string }[];
  return new Set(rows.map((r) => r.application_id));
}

export async function countPendingFollowUps(): Promise<number> {
  const row = await dbGet(`SELECT COUNT(*) AS c FROM follow_ups
       WHERE status IN ('pending', 'enqueued', 'snoozed', 'processing')
         AND status != 'skipped'
         AND (
           status = 'enqueued'
           OR (due_at IS NOT NULL AND due_at::timestamptz <= NOW() + INTERVAL '7 days')
         )`) as { c: number };
  return row.c;
}

export async function countSnoozedFollowUps(): Promise<number> {
  const row = await dbGet(`SELECT COUNT(*) AS c FROM follow_ups WHERE status = 'snoozed'`) as { c: number };
  return row.c;
}
