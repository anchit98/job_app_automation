import Link from "next/link";
import { dbGet } from "@/lib/db";
import { listRecentPromptRuns } from "@/lib/db/queries";
import { isGoogleConnected } from "@/lib/google/tokens";
import { getActiveExtensionTokenRow } from "@/lib/extension/tokens";
import { peekQueuedExtensionRun } from "@/lib/db/pipeline";

export default async function HealthPage() {
  let dbOk = true;
  let dbError: string | null = null;
  try {
    await dbGet("SELECT 1 as ok");
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : "Database error";
  }

  const [googleConnected, recentRuns, extensionToken, pendingExt] =
    await Promise.all([
      isGoogleConnected().catch(() => false),
      listRecentPromptRuns(8),
      getActiveExtensionTokenRow(),
      peekQueuedExtensionRun(),
    ]);

  const pendingCount = recentRuns.filter((r) => r.status === "pending").length;

  const checks = [
    {
      label: "Postgres",
      ok: dbOk,
      detail: dbOk ? "DATABASE_URL reachable" : dbError,
    },
    {
      label: "Google OAuth",
      ok: googleConnected,
      detail: googleConnected
        ? "Connected"
        : "Connect Google from the dashboard",
    },
    {
      label: "Extension token",
      ok: Boolean(extensionToken),
      detail: extensionToken
        ? `Active (${extensionToken.token_prefix}…)`
        : "Generate in Settings",
    },
    {
      label: "Pending prompt runs",
      ok: pendingCount < 10,
      detail: `${pendingCount} pending`,
    },
    {
      label: "Extension queue",
      ok: true,
      detail: pendingExt
        ? `Waiting on ${pendingExt.kind} (${pendingExt.prompt_run_id.slice(0, 8)}…)`
        : "Empty",
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <Link
          href="/settings"
          className="li-meta hover:text-primary no-underline"
        >
          ← Settings
        </Link>
        <h1 className="li-page-title mt-1">Health</h1>
      </div>

      {!googleConnected && (
        <div className="li-card-flat border-l-4 border-l-status-waiting bg-status-waiting-container p-4">
          <p className="text-[14px] text-on-surface">
            Connect Google to see Drive/Gmail status for exports.
          </p>
          <Link href="/dashboard" className="text-[13px] font-semibold text-primary hover:underline mt-2 inline-block">
            Go to dashboard →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <ul className="lg:col-span-5 li-card divide-y divide-border-muted overflow-hidden">
          {checks.map((c) => (
            <li
              key={c.label}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span
                className={`material-symbols-outlined ${
                  c.ok ? "text-success" : "text-error"
                }`}
              >
                {c.ok ? "check_circle" : "error"}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-on-surface">
                  {c.label}
                </div>
                <div className="li-meta">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="lg:col-span-7 li-card p-4">
          <h2 className="li-section-title mb-3">
            Recent prompt runs
          </h2>
          <ul className="divide-y divide-border-muted max-h-[360px] overflow-y-auto">
            {recentRuns.map((r) => (
              <li
                key={r.id}
                className="flex justify-between gap-2 py-2 text-[12px]"
              >
                <span className="text-on-surface">
                  {r.kind} · {r.status}
                </span>
                <span className="text-on-surface-variant font-mono">
                  {r.id.slice(0, 8)}
                </span>
              </li>
            ))}
            {recentRuns.length === 0 && (
              <li className="li-meta py-2">No prompt runs yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
