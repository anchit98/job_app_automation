import { getDb } from "@/lib/db";

/** Prune large raw_response blobs from completed runs older than N days. */
export function pruneStalePromptRawResponses(days = 90): number {
  const result = getDb()
    .prepare(
      `UPDATE prompt_runs
       SET raw_response = NULL
       WHERE raw_response IS NOT NULL
         AND status = 'completed'
         AND completed_at IS NOT NULL
         AND completed_at < datetime('now', ?)`,
    )
    .run(`-${days} days`);
  return result.changes;
}

/** Auto-abandon pending prompt runs older than N hours with no paste-back. */
export function abandonStalePendingPromptRuns(hours = 24): number {
  const result = getDb()
    .prepare(
      `UPDATE prompt_runs
       SET status = 'abandoned'
       WHERE status = 'pending'
         AND prompt_text != ''
         AND exported_at < datetime('now', ?)`,
    )
    .run(`-${hours} hours`);
  return result.changes;
}

export function runTrackerMaintenance() {
  abandonStalePendingPromptRuns();
  pruneStalePromptRawResponses();
}
