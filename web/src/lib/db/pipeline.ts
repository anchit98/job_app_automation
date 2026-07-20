import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import {
  buildInitialStages,
  type PipelineContactInput,
  type PipelineRunRecord,
  type PipelineRunStatus,
  type PipelineStage,
  type PipelineStageId,
} from "@/lib/pipeline/types";

function mapPipelineRow(row: Record<string, unknown>): PipelineRunRecord {
  return {
    id: row.id as string,
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

export function insertPipelineRun(input: {
  application_id: string;
  contacts: PipelineContactInput[];
}): PipelineRunRecord {
  const id = randomUUID();
  const stages = buildInitialStages();
  stages[0] = {
    ...stages[0],
    status: "completed",
    detail: "Application created",
  };

  getDb()
    .prepare(
      `INSERT INTO pipeline_runs
         (id, application_id, status, current_stage, stages_json, contacts_json)
       VALUES (?, ?, 'running', 'jd_parse', ?, ?)`,
    )
    .run(
      id,
      input.application_id,
      JSON.stringify(stages),
      JSON.stringify(input.contacts),
    );

  return getPipelineRunById(id)!;
}

export function getPipelineRunById(id: string): PipelineRunRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM pipeline_runs WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapPipelineRow(row) : null;
}

export function updatePipelineRun(
  id: string,
  patch: {
    status?: PipelineRunStatus;
    current_stage?: PipelineStageId | null;
    stages?: PipelineStage[];
    error?: string | null;
  },
): PipelineRunRecord | null {
  const existing = getPipelineRunById(id);
  if (!existing) return null;

  const status = patch.status ?? existing.status;
  const current_stage =
    patch.current_stage !== undefined
      ? patch.current_stage
      : existing.current_stage;
  const stages = patch.stages ?? existing.stages;
  const error =
    patch.error !== undefined ? patch.error : existing.error;

  getDb()
    .prepare(
      `UPDATE pipeline_runs
       SET status = ?, current_stage = ?, stages_json = ?, error = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      status,
      current_stage,
      JSON.stringify(stages),
      error,
      id,
    );

  return getPipelineRunById(id);
}

export function upsertPendingExtensionRun(input: {
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  prompt_text: string;
  chatgpt_url?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pending_extension_runs
         (prompt_run_id, pipeline_run_id, kind, prompt_text, chatgpt_url, status, wake_until)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL)
       ON CONFLICT(prompt_run_id) DO UPDATE SET
         pipeline_run_id = excluded.pipeline_run_id,
         kind = excluded.kind,
         prompt_text = excluded.prompt_text,
         chatgpt_url = excluded.chatgpt_url,
         status = 'pending',
         error = NULL,
         wake_until = NULL,
         updated_at = datetime('now')`,
    )
    .run(
      input.prompt_run_id,
      input.pipeline_run_id,
      input.kind,
      input.prompt_text,
      input.chatgpt_url ?? "https://chatgpt.com/",
    );
}

/** Short-lived arm so ChatGPT only opens after an explicit Quick Apply signal. */
export function armExtensionWake(promptRunId: string, seconds = 60): boolean {
  const result = getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET wake_until = datetime('now', ?),
           status = CASE
             WHEN status IN ('pending', 'claimed') THEN status
             ELSE 'pending'
           END,
           error = NULL,
           updated_at = datetime('now')
       WHERE prompt_run_id = ?
         AND status IN ('pending', 'claimed')`,
    )
    .run(`+${Math.max(5, seconds)} seconds`, promptRunId);
  return result.changes > 0;
}

/**
 * Atomically consume a wake arm. Returns the run payload only when armed;
 * otherwise null. Prevents refresh / background polls from opening ChatGPT.
 */
export function consumeExtensionWake(promptRunId: string): {
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  prompt_text: string;
  chatgpt_url: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT prompt_run_id, pipeline_run_id, kind, prompt_text, chatgpt_url
       FROM pending_extension_runs
       WHERE prompt_run_id = ?
         AND status IN ('pending', 'claimed')
         AND wake_until IS NOT NULL
         AND datetime(wake_until) > datetime('now')`,
    )
    .get(promptRunId) as
    | {
        prompt_run_id: string;
        pipeline_run_id: string | null;
        kind: string;
        prompt_text: string;
        chatgpt_url: string;
      }
    | undefined;

  if (!row) return null;

  getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET wake_until = NULL, updated_at = datetime('now')
       WHERE prompt_run_id = ?`,
    )
    .run(promptRunId);

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

/** Health / UI only — does not arm or open ChatGPT. */
export function peekQueuedExtensionRun(): {
  prompt_run_id: string;
  kind: string;
  status: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT prompt_run_id, kind, status
       FROM pending_extension_runs
       WHERE status IN ('pending', 'claimed')
       ORDER BY datetime(updated_at) DESC
       LIMIT 1`,
    )
    .get() as
    | { prompt_run_id: string; kind: string; status: string }
    | undefined;
  return row ?? null;
}

export function reclaimPendingExtensionRun(promptRunId: string): void {
  getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET status = 'pending', error = NULL, updated_at = datetime('now')
       WHERE prompt_run_id = ? AND status IN ('claimed', 'failed', 'timed_out')`,
    )
    .run(promptRunId);
}

export function claimPendingExtensionRun(promptRunId: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET status = 'claimed', updated_at = datetime('now')
       WHERE prompt_run_id = ? AND status = 'pending'`,
    )
    .run(promptRunId);
  return result.changes > 0;
}

export function cancelAllPendingExtensionRuns(reason = "cancelled"): number {
  const result = getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET status = 'completed',
           error = ?,
           wake_until = NULL,
           updated_at = datetime('now')
       WHERE status IN ('pending', 'claimed')`,
    )
    .run(reason);
  return result.changes;
}

export function completePendingExtensionRun(
  promptRunId: string,
  status: "completed" | "failed" | "timed_out" = "completed",
  error?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE pending_extension_runs
       SET status = ?, error = ?, updated_at = datetime('now')
       WHERE prompt_run_id = ?`,
    )
    .run(status, error ?? null, promptRunId);
}

export function getPendingExtensionRun(
  promptRunId: string,
): {
  prompt_run_id: string;
  pipeline_run_id: string | null;
  kind: string;
  status: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT prompt_run_id, pipeline_run_id, kind, status
       FROM pending_extension_runs WHERE prompt_run_id = ?`,
    )
    .get(promptRunId) as
    | {
        prompt_run_id: string;
        pipeline_run_id: string | null;
        kind: string;
        status: string;
      }
    | undefined;
  return row ?? null;
}

export function findPipelineByPromptRun(
  promptRunId: string,
): PipelineRunRecord | null {
  const pending = getPendingExtensionRun(promptRunId);
  if (pending?.pipeline_run_id) {
    return getPipelineRunById(pending.pipeline_run_id);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM pipeline_runs ORDER BY datetime(created_at) DESC LIMIT 20`)
    .all() as Record<string, unknown>[];
  for (const row of rows) {
    const run = mapPipelineRow(row);
    if (run.stages.some((s) => s.prompt_run_id === promptRunId)) {
      return run;
    }
  }
  return null;
}
