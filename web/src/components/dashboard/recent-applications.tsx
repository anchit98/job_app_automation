import Link from "next/link";
import { APPLICATION_STATUS_LABELS } from "@/lib/applications/status";
import type { ApplicationListItem } from "@/lib/tracker/search";

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusChipClass(status: string) {
  switch (status) {
    case "applied":
      return "bg-secondary-container text-on-secondary-container border-secondary-container";
    case "interview_scheduled":
      return "bg-primary-container text-on-primary-container border-primary-container";
    case "offer":
    case "accepted":
      return "bg-success-container text-on-success-container border-success-container";
    case "rejected":
    case "withdrawn":
      return "bg-error-container text-on-error-container border-error-container";
    default:
      return "bg-surface-container-high text-on-surface border-outline-variant border-dashed";
  }
}

function companyInitials(company: string | null) {
  const name = (company ?? "").trim();
  if (!name) return "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface RecentApplicationsProps {
  items: ApplicationListItem[];
}

export function RecentApplications({ items }: RecentApplicationsProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            aria-hidden
          >
            history
          </span>
          <h2 className="li-section-title">Recent applications</h2>
        </div>
        {items.length > 0 && (
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary no-underline hover:underline"
          >
            View all
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              arrow_forward
            </span>
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-low/50 px-6 py-10 text-center">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-primary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[24px]">
              rocket_launch
            </span>
          </span>
          <div>
            <p className="text-[14px] font-semibold text-on-surface">
              No applications yet
            </p>
            <p className="li-meta mt-1">
              Paste a job description and let the pipeline tailor everything for
              you.
            </p>
          </div>
          <Link
            href="/apply"
            className="li-btn-primary no-underline text-[13px]"
          >
            Start your first Apply
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-hairline -mx-1">
          {items.map((item) => {
            const label = item.role || item.company || "Untitled application";
            return (
              <li key={item.id}>
                <Link
                  href={`/applications/${item.id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2.5 no-underline transition-colors hover:bg-[var(--ghost-hover)]"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-[13px] font-bold text-on-surface-variant"
                    aria-hidden
                  >
                    {companyInitials(item.company)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-on-surface">
                      {label}
                    </span>
                    <span className="block truncate text-[12px] text-on-surface-variant">
                      {item.company || "Unknown company"} ·{" "}
                      {formatRelativeTime(item.updated_at)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusChipClass(item.status)}`}
                  >
                    {APPLICATION_STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
