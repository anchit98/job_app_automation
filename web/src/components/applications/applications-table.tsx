"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { APPLICATION_STATUS_LABELS } from "@/lib/applications/status";
import { ApplicationPipelineActions } from "@/components/applications/application-pipeline-actions";
import { deleteApplication } from "@/app/actions/tracker";
import type { ApplicationSearchResult } from "@/lib/tracker/search";

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getStatusStyle(status: string) {
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

const STATUS_FILTERS = [
  { id: "", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "applied", label: "Applied" },
  { id: "interview_stage", label: "Interview" },
] as const;

interface ApplicationsTableProps {
  initial: ApplicationSearchResult;
}

export function ApplicationsTable({ initial }: ApplicationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const activeStatus = searchParams.get("status") ?? "";

  const pushParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }
      if (!updates.page) params.delete("page");
      startTransition(() => {
        router.push(`/applications?${params.toString()}`);
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (query !== current) {
        pushParams({ q: query.trim() || null });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, pushParams, searchParams]);

  const { items, total, page, totalPages } = initial;

  function handleDelete(appId: string, label: string) {
    if (
      !window.confirm(
        `Delete "${label}" and all related resumes, contacts, and emails? Drive files are not removed automatically.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteApplication(appId);
      if (!result.ok) {
        window.alert(result.error ?? "Failed to delete application.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="li-card p-3 flex flex-col gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id || "all"}
              type="button"
              onClick={() => pushParams({ status: filter.id || null })}
              className={`px-3 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors border min-h-10 ${
                activeStatus === filter.id
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface text-on-surface-variant border-border-hairline hover:bg-[var(--ghost-hover)] hover:text-on-surface"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search JD, notes, company, role…"
            className="w-full min-h-11 bg-canvas border border-border-hairline text-on-surface pl-10 pr-4 py-2.5 text-[14px] rounded-lg focus:border-primary outline-none"
          />
        </div>

        <p className="li-meta">
          {total} result{total === 1 ? "" : "s"}
          {pending ? " · updating…" : ""}
        </p>
      </div>

      <div className="py-1">
        {items.length === 0 ? (
          <div className="li-card flex flex-col items-center justify-center text-center py-16">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant mb-3">
              work_off
            </span>
            <p className="text-[16px] font-semibold text-on-surface">No applications match.</p>
            <Link href="/apply" className="text-primary font-semibold hover:underline mt-2 text-[14px]">
              Apply to a new role
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden md:block w-full li-card overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-canvas border-b border-border-muted text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
                <div className="col-span-3">Company - Role</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1 text-center">JD</div>
                <div className="col-span-1 text-center">Resume</div>
                <div className="col-span-1 text-right">Updated</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>
              <div className="divide-y divide-border-muted">
                {items.map((app, idx) => (
                  <div
                    key={app.id}
                    className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-[var(--ghost-hover)] transition-colors ${
                      idx % 2 === 1 ? "bg-canvas/60" : "bg-surface"
                    }`}
                  >
                    <Link
                      href={`/applications/${app.id}`}
                      className="col-span-3 flex items-center gap-3 min-w-0 no-underline"
                    >
                      <div className="w-12 h-12 rounded-[4px] bg-primary-container text-primary flex items-center justify-center font-semibold border border-border-hairline shrink-0 text-[16px]">
                        {(app.company || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-on-surface truncate">
                          {app.company || "Unknown company"}
                        </div>
                        <div className="text-[12px] text-on-surface-variant truncate">
                          {app.role || "Unknown role"}
                        </div>
                      </div>
                    </Link>
                    <div className="col-span-2">
                      <span
                        className={`li-chip border ${getStatusStyle(app.status)}`}
                      >
                        {APPLICATION_STATUS_LABELS[app.status]}
                      </span>
                      {app.is_incomplete && (
                        <span className="block text-[10px] text-error mt-1">
                          No resume
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-center text-[12px] text-on-surface-variant">
                      {app.jd_parsed ? "Parsed" : "Raw"}
                    </div>
                    <div className="col-span-1 text-center text-[12px] text-on-surface">
                      {app.latest_resume_version != null
                        ? `v${app.latest_resume_version}`
                        : "-"}
                    </div>
                    <div className="col-span-1 text-right text-[12px] text-on-surface-variant">
                      {formatRelativeTime(app.updated_at)}
                    </div>
                    <div className="col-span-4 flex justify-end items-center gap-1.5 flex-wrap">
                      {app.pipeline && (
                        <ApplicationPipelineActions
                          pipelineId={app.pipeline.pipeline_id}
                          status={app.pipeline.status}
                          currentStage={app.pipeline.current_stage}
                          error={app.pipeline.error}
                          canResume={app.pipeline.can_resume}
                          compact
                        />
                      )}
                      <button
                        type="button"
                        title="Delete application"
                        disabled={pending}
                        onClick={() =>
                          handleDelete(
                            app.id,
                            `${app.company || "Unknown"} - ${app.role || "role"}`,
                          )
                        }
                        className="p-1.5 rounded-md text-on-surface-variant hover:text-error hover:bg-error-container/40 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:hidden space-y-2">
              {items.map((app) => (
                <div key={app.id} className="li-card p-4 space-y-3">
                  <Link
                    href={`/applications/${app.id}`}
                    className="mobile-card-row no-underline"
                  >
                    <div className="mobile-avatar rounded-[6px] bg-primary-container text-primary flex items-center justify-center font-semibold text-[16px]">
                      {(app.company || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-on-surface truncate">
                        {app.company || "Unknown"}
                      </p>
                      <p className="text-[13px] text-on-surface-variant truncate">
                        {app.role || "Unknown role"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 li-chip border ${getStatusStyle(app.status)}`}
                    >
                      {APPLICATION_STATUS_LABELS[app.status]}
                    </span>
                  </Link>

                  <div className="grid grid-cols-2 gap-2 text-[12px] text-on-surface-variant border-t border-border-hairline pt-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide font-semibold">
                        Resume
                      </p>
                      <p className="mt-0.5 text-on-surface font-medium">
                        {app.latest_resume_version != null
                          ? `v${app.latest_resume_version}`
                          : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide font-semibold">
                        Updated
                      </p>
                      <p className="mt-0.5 text-on-surface font-medium">
                        {formatRelativeTime(app.updated_at)}
                      </p>
                    </div>
                  </div>

                  {app.is_incomplete ? (
                    <p className="text-[12px] text-error font-medium">
                      No resume attached
                    </p>
                  ) : null}

                  <div className="flex items-center justify-end gap-1.5 border-t border-border-hairline pt-2 flex-wrap">
                    {app.pipeline && (
                      <ApplicationPipelineActions
                        pipelineId={app.pipeline.pipeline_id}
                        status={app.pipeline.status}
                        currentStage={app.pipeline.current_stage}
                        error={app.pipeline.error}
                        canResume={app.pipeline.can_resume}
                        compact
                      />
                    )}
                    <button
                      type="button"
                      title="Delete application"
                      disabled={pending}
                      onClick={() =>
                        handleDelete(
                          app.id,
                          `${app.company || "Unknown"} - ${app.role || "role"}`,
                        )
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant hover:text-error hover:bg-error-container/40 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        delete
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  disabled={page <= 1 || pending}
                  onClick={() => pushParams({ page: String(page - 1) })}
                  className="li-btn-secondary text-[13px] disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="li-meta">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || pending}
                  onClick={() => pushParams({ page: String(page + 1) })}
                  className="li-btn-secondary text-[13px] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
