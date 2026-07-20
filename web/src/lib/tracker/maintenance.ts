import { dbRun } from "@/lib/db";

/** Prune large raw_response blobs from completed runs older than N days. */
export async function pruneStalePromptRawResponses(days = 90): Promise<number> {
  const result = await dbRun(`UPDATE prompt_runs
       SET raw_response = NULL
       WHERE raw_response IS NOT NULL
         AND status = 'completed'
         AND completed_at IS NOT NULL
         AND completed_at < (NOW() AT TIME ZONE 'utc' + (?::text)::interval)::text`, `-${days} days`);
  return result.changes;
}

/** Auto-abandon pending prompt runs older than N hours with no paste-back. */
export async function abandonStalePendingPromptRuns(hours = 24): Promise<number> {
  const result = await dbRun(`UPDATE prompt_runs
       SET status = 'abandoned'
       WHERE status = 'pending'
         AND prompt_text != ''
         AND exported_at < (NOW() AT TIME ZONE 'utc' + (?::text)::interval)::text`, `-${hours} hours`);
  return result.changes;
}

export async function runTrackerMaintenance() {
  await abandonStalePendingPromptRuns();
  await pruneStalePromptRawResponses();
}
