import { randomUUID } from "crypto";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import { getRequestUserId } from "@/lib/auth/request-user";
import { requireUser } from "@/lib/auth/user";
import {
  buildInitialStages,
  type PipelineContactInput,
  type PipelineRunRecord,
  type PipelineRunStatus,
  type PipelineStage,
  type PipelineStageId,
} from "@/lib/pipeline/types";

async function currentUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromAls = getRequestUserId();
  if (fromAls) return fromAls;
  return (await requireUser()).id;
}

function mapPipelineRow(row: Record<string, unknown>): PipelineRunRecord {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    application_id: row.application_id as string,
    status: row.status as PipelineRunStatus,
    current_stage: (row.current_stage as PipelineStageId) || null,
    stages: JSON.parse((row.stages_json as string) || "[]") as PipelineStage[],
    contacts: JSON.parse((row.contacts_json as string) || "[]") as PipelineContactInput[],
    error: (row.error as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function insertPipelineRun(input: {
  application_id: string;
  contacts: PipelineContactInput[];
  userId?: string;
}): Promise<PipelineRunRecord> {
  const id = randomUUID();
  const uid = await currentUserId(input.userId);
  const stages = buildInitialStages();
  stages[0] = {
    ...stages[0],
    status: "completed",
    detail: "Application created",
  };

  await dbRun(`INSERT INTO pipeline_runs
         (id, user_id, application_id, status, current_stage, stages_json, contacts_json)
       VALUES (?, ?, ?, 'running', 'jd_parse', ?, ?)`, id,
      uid,
      input.application_id,
      JSON.stringify(stages),
      JSON.stringify(input.contacts),);

  const run = await getPipelineRunById(id);
  if (!run) throw new Error(`Pipeline run ${id} not found after insert`);
  return run;
}

export async function getPipelineRunById(
  id: string,
  userId?: string,
): Promise<PipelineRunRecord | null> {
  let uid = userId ?? getRequestUserId();
  if (!uid) {
    try {
      uid = (await requireUser()).id;
    } catch {
      uid = undefined;
    }
  }
  const row = (
    uid
      ? await dbGet(
          `SELECT * FROM pipeline_runs WHERE id = ? AND user_id = ?`,
          id,
          uid,
        )
      : await dbGet(`SELECT * FROM pipeline_runs WHERE id = ?`, id)
  ) as Record<string, unknown> | undefined;
  return row ? mapPipelineRow(row) : null;
}

export async function updatePipelineRun(
  id: string,
  patch: {
    status?: PipelineRunStatus;
    current_stage?: PipelineStageId | null;
    stages?: PipelineStage[];
    error?: string | null;
  },
): Promise<PipelineRunRecord | null> {
  const existing = await getPipelineRunById(id);
  if (!existing) return null;

  const status = patch.status ?? existing.status;
  const current_stage =
    patch.current_stage !== undefined
      ? patch.current_stage
      : existing.current_stage;
  const stages = patch.stages ?? existing.stages;
  const error =
    patch.error !== undefined ? patch.error : existing.error;

  await dbRun(`UPDATE pipeline_runs
       SET status = ?, current_stage = ?, stages_json = ?, error = ?,
           updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE id = ?`, status,
      current_stage,
      JSON.stringify(stages),
      error,
      id,);

  return await getPipelineRunById(id);
}

/**
 * Atomically claim a pending pipeline stage before exporting a ChatGPT prompt.
 * Only one concurrent caller (UI poll vs paste-back on separate Vercel isolates)
 * wins - losers get null and should reuse the winner's awaiting state.
 */
export async function claimPipelineStageStart(
  id: string,
  stageId: PipelineStageId,
): Promise<PipelineRunRecord | null> {
  const existing = await getPipelineRunById(id);
  if (!existing) return null;

  const stage = existing.stages.find((s) => s.id === stageId);
  if (!stage || (stage.status !== "pending" && stage.status !== "failed")) {
    return null;
  }

  const stages = existing.stages.map((s) =>
    s.id === stageId
      ? {
          ...s,
          status: "running" as const,
          error: null,
          detail: "Starting…",
        }
      : s,
  );

  const row = (await dbGet(
    `UPDATE pipeline_runs
       SET status = 'running',
           current_stage = ?,
           stages_json = ?,
           error = NULL,
           updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE id = ?
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(stages_json::jsonb) AS e
         WHERE e->>'id' = ?
           AND e->>'status' IN ('pending', 'failed')
       )
     RETURNING *`,
    stageId,
    JSON.stringify(stages),
    id,
    stageId,
  )) as Record<string, unknown> | undefined;

  return row ? mapPipelineRow(row) : null;
}

export async function upsertPendingExtensionRun(input: {
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  prompt_text: string;
  chatgpt_url?: string;
}): Promise<void> {
  await dbRun(
    `INSERT INTO pending_extension_runs
         (prompt_run_id, pipeline_run_id, kind, prompt_text, chatgpt_url, status, wake_until)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL)
       ON CONFLICT (prompt_run_id) DO UPDATE SET
         pipeline_run_id = excluded.pipeline_run_id,
         kind = excluded.kind,
         prompt_text = excluded.prompt_text,
         chatgpt_url = excluded.chatgpt_url,
         status = 'pending',
         error = NULL,
         wake_until = NULL,
         updated_at = (NOW() AT TIME ZONE 'utc')::text`,
    input.prompt_run_id,
    input.pipeline_run_id,
    input.kind,
    input.prompt_text,
    input.chatgpt_url ?? "https://chatgpt.com/",
  );
}

/** Short-lived arm so ChatGPT only opens after an explicit Quick Apply signal. */
export async function armExtensionWake(promptRunId: string, seconds = 60): Promise<boolean> {
  const secs = Math.max(5, Math.floor(seconds));
  // Use RETURNING - postgres.js `count` is unreliable for UPDATE without it.
  const row = await dbGet<{ prompt_run_id: string }>(
    `UPDATE pending_extension_runs
       SET wake_until = ((NOW() AT TIME ZONE 'utc') + make_interval(secs => ?::int))::text,
           status = CASE
             WHEN status IN ('pending', 'claimed') THEN status
             ELSE 'pending'
           END,
           error = NULL,
           updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE prompt_run_id = ?
         AND status IN ('pending', 'claimed')
       RETURNING prompt_run_id`,
    secs,
    promptRunId,
  );
  return Boolean(row?.prompt_run_id);
}

/**
 * Atomically consume a wake arm. Returns the run payload only when armed;
 * otherwise null. Prevents refresh / background polls from opening ChatGPT.
 */
export async function consumeExtensionWake(promptRunId: string): Promise<{
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  prompt_text: string;
  chatgpt_url: string;
} | null> {
  const row = await dbGet(`SELECT prompt_run_id, pipeline_run_id, kind, prompt_text, chatgpt_url
       FROM pending_extension_runs
       WHERE prompt_run_id = ?
         AND status IN ('pending', 'claimed')
         AND wake_until IS NOT NULL
         AND (wake_until::timestamp without time zone) > (NOW() AT TIME ZONE 'utc')`, promptRunId) as
    | {
        prompt_run_id: string;
        pipeline_run_id: string | null;
        kind: string;
        prompt_text: string;
        chatgpt_url: string;
      }
    | undefined;

  if (!row) return null;

  await dbRun(`UPDATE pending_extension_runs
       SET wake_until = NULL, updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE prompt_run_id = ?`, promptRunId);

  return row;
}

export function getLatestPendingExtensionRun(): {
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  prompt_text: string;
  chatgpt_url: string;
  status: string;
  created_at: string;
} | null {
  // Polling is intentionally disabled: only consumeExtensionWake may start a run.
  // Returning null stops older extension builds that still poll on refresh/focus.
  return null;
}

/** Health / UI only - does not arm or open ChatGPT. */
export async function peekQueuedExtensionRun(): Promise<{
  prompt_run_id: string;
  kind: string;
  status: string;
} | null> {
  const row = await dbGet(`SELECT prompt_run_id, kind, status
       FROM pending_extension_runs
       WHERE status IN ('pending', 'claimed')
       ORDER BY updated_at::timestamptz DESC
       LIMIT 1`) as
    | { prompt_run_id: string; kind: string; status: string }
    | undefined;
  return row ?? null;
}

export async function reclaimPendingExtensionRun(promptRunId: string): Promise<void> {
  await dbRun(
    `UPDATE pending_extension_runs
       SET status = 'pending', error = NULL, updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE prompt_run_id = ? AND status IN ('claimed', 'failed', 'timed_out')`,
    promptRunId,
  );
}

export async function claimPendingExtensionRun(promptRunId: string): Promise<boolean> {
  const result = await dbRun(`UPDATE pending_extension_runs
       SET status = 'claimed', updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE prompt_run_id = ? AND status = 'pending'`, promptRunId);
  return result.changes > 0;
}

export async function cancelAllPendingExtensionRuns(reason = "cancelled"): Promise<number> {
  const result = await dbRun(`UPDATE pending_extension_runs
       SET status = 'completed',
           error = ?,
           wake_until = NULL,
           updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE status IN ('pending', 'claimed')`, reason);
  return result.changes;
}

export async function completePendingExtensionRun(
  promptRunId: string,
  status: "completed" | "failed" | "timed_out" = "completed",
  error?: string | null,
): Promise<void> {
  await dbRun(
    `UPDATE pending_extension_runs
       SET status = ?, error = ?, updated_at = (NOW() AT TIME ZONE 'utc')::text
       WHERE prompt_run_id = ?`,
    status,
    error ?? null,
    promptRunId,
  );
}

export async function getPendingExtensionRun(
  promptRunId: string,
): Promise<{
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  status: string;
} | null> {
  const row = await dbGet(`SELECT prompt_run_id, pipeline_run_id, kind, status
       FROM pending_extension_runs WHERE prompt_run_id = ?`, promptRunId) as
    | {
        prompt_run_id: string;
        pipeline_run_id: string | null;
        kind: string;
        status: string;
      }
    | undefined;
  return row ?? null;
}

export async function findPipelineByPromptRun(
  promptRunId: string,
): Promise<PipelineRunRecord | null> {
  const pending = await getPendingExtensionRun(promptRunId);
  if (pending?.pipeline_run_id) {
    return await getPipelineRunById(pending.pipeline_run_id);
  }
  let uid = getRequestUserId();
  if (!uid) {
    try {
      uid = (await requireUser()).id;
    } catch {
      uid = undefined;
    }
  }
  const rows = (
    uid
      ? await dbAll(
          `SELECT * FROM pipeline_runs WHERE user_id = ? ORDER BY created_at::timestamptz DESC LIMIT 20`,
          uid,
        )
      : await dbAll(
          `SELECT * FROM pipeline_runs ORDER BY created_at::timestamptz DESC LIMIT 20`,
        )
  ) as Record<string, unknown>[];
  for (const row of rows) {
    const run = mapPipelineRow(row);
    if (run.stages.some((s) => s.prompt_run_id === promptRunId)) {
      return run;
    }
  }
  return null;
}

/** Pipelines currently doing work (not queued / terminal). */
export async function listBusyPipelineRuns(userId?: string): Promise<PipelineRunRecord[]> {
  const uid = await currentUserId(userId);
  const rows = (await dbAll(
    `SELECT * FROM pipeline_runs
     WHERE user_id = ?
       AND status IN ('running', 'awaiting_chatgpt')
     ORDER BY created_at::timestamptz ASC`,
    uid,
  )) as Record<string, unknown>[];
  return rows.map(mapPipelineRow);
}

export async function listQueuedPipelineRuns(userId?: string): Promise<PipelineRunRecord[]> {
  const uid = await currentUserId(userId);
  const rows = (await dbAll(
    `SELECT * FROM pipeline_runs
     WHERE user_id = ?
       AND status = 'queued'
     ORDER BY created_at::timestamptz ASC`,
    uid,
  )) as Record<string, unknown>[];
  return rows.map(mapPipelineRow);
}

export async function getLatestPipelineForApplication(
  applicationId: string,
  userId?: string,
): Promise<PipelineRunRecord | null> {
  const uid = await currentUserId(userId);
  const row = (await dbGet(
    `SELECT * FROM pipeline_runs
     WHERE application_id = ? AND user_id = ?
     ORDER BY created_at::timestamptz DESC
     LIMIT 1`,
    applicationId,
    uid,
  )) as Record<string, unknown> | undefined;
  return row ? mapPipelineRow(row) : null;
}

export async function listLatestPipelinesForApplications(
  applicationIds: string[],
  userId?: string,
): Promise<Map<string, PipelineRunRecord>> {
  const map = new Map<string, PipelineRunRecord>();
  if (applicationIds.length === 0) return map;
  const uid = await currentUserId(userId);
  const placeholders = applicationIds.map(() => "?").join(", ");
  const rows = (await dbAll(
    `SELECT DISTINCT ON (application_id) *
     FROM pipeline_runs
     WHERE user_id = ?
       AND application_id IN (${placeholders})
     ORDER BY application_id, created_at::timestamptz DESC`,
    uid,
    ...applicationIds,
  )) as Record<string, unknown>[];
  for (const row of rows) {
    const run = mapPipelineRow(row);
    map.set(run.application_id, run);
  }
  return map;
}

export async function claimNextQueuedPipeline(userId?: string): Promise<PipelineRunRecord | null> {
  const uid = await currentUserId(userId);
  const busy = await listBusyPipelineRuns(uid);
  if (busy.length > 0) return null;

  const row = (await dbGet(
    `UPDATE pipeline_runs
     SET status = 'running',
         updated_at = (NOW() AT TIME ZONE 'utc')::text
     WHERE id = (
       SELECT id FROM pipeline_runs
       WHERE status = 'queued' AND user_id = ?
       ORDER BY created_at::timestamptz ASC
       LIMIT 1
     )
     RETURNING *`,
    uid,
  )) as Record<string, unknown> | undefined;
  return row ? mapPipelineRow(row) : null;
}
