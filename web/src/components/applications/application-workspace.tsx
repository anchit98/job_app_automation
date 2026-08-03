"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteApplication } from "@/app/actions/tracker";
import { ApplicationStatusSelect } from "@/components/applications/application-status-select";
import { ApplicationNotesEditor } from "@/components/applications/application-notes-editor";
import { ApplicationTimeline } from "@/components/applications/application-timeline";
import {
  AutoApplyOnlyHint,
  ContactArtifacts,
  CoverLetterArtifacts,
  EmailArtifacts,
  ResumeArtifacts,
} from "@/components/applications/application-artifacts";
import { ApplicationPipelineActions } from "@/components/applications/application-pipeline-actions";
import type {
  Application,
  Contact,
  CoverLetterVersion,
  EmailRecord,
  FollowUp,
  ResumeVersion,
} from "@/lib/db/types";
import type { ResumeContent } from "@/lib/resume/fabrication";
import { formatAppDateTime } from "@/lib/datetime/india";
import type { TimelineEvent } from "@/lib/tracker/timeline";

interface ApplicationWorkspaceProps {
  application: Application;
  masterResume: ResumeContent | null;
  resumeVersions: ResumeVersion[];
  coverLetterVersions: CoverLetterVersion[];
  coverLetterTemplateReady: boolean;
  contacts: Contact[];
  emails: EmailRecord[];
  followUps?: FollowUp[];
  googleConnected: boolean;
  timelineEvents: TimelineEvent[];
  pipeline?: {
    pipeline_id: string;
    status: string;
    current_stage: string | null;
    error: string | null;
    can_resume: boolean;
  } | null;
}

export function ApplicationWorkspace({
  application,
  masterResume: _masterResume,
  resumeVersions,
  coverLetterVersions,
  coverLetterTemplateReady: _coverLetterTemplateReady,
  contacts,
  emails,
  followUps,
  googleConnected: _googleConnected,
  timelineEvents,
  pipeline,
}: ApplicationWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<
    "overview" | "documents" | "outreach" | "details"
  >("overview");

  const title =
    application.company && application.role
      ? `${application.company} - ${application.role}`
      : application.company || application.role || "Application";

  function handleDelete() {
    if (
      !window.confirm(
        "Delete this application and all related resumes, contacts, and emails? Drive files are not removed automatically.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteApplication(application.id);
      if (result.ok) router.push("/applications");
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-52px)] overflow-hidden bg-canvas">
      {/* Workspace Header */}
      <header className="min-h-[56px] py-2 bg-surface border-b border-border-hairline flex flex-wrap items-center justify-between gap-3 px-margin-mobile md:px-margin-desktop shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/applications" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="w-12 h-12 rounded-[4px] bg-primary-container text-primary flex items-center justify-center font-semibold border border-border-hairline text-[18px]">
            {(application.company || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-[18px] font-semibold leading-6 text-on-surface truncate max-w-xs md:max-w-md">{title}</h1>
            <p className="li-meta">
              {application.jd_parsed?.location || "Remote/Unknown"} · {application.jd_parsed?.seniority || "Full-time"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pipeline && (
            <ApplicationPipelineActions
              pipelineId={pipeline.pipeline_id}
              status={pipeline.status}
              currentStage={pipeline.current_stage}
              error={pipeline.error}
              canResume={pipeline.can_resume}
            />
          )}
          <ApplicationStatusSelect
            applicationId={application.id}
            currentStatus={application.status}
            variant="compact"
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="li-btn-ghost text-[12px] text-error border border-border-hairline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      {/* Workspace Tabs - fewer tabs, panels side by side inside each */}
      <div className="px-margin-mobile md:px-margin-desktop border-b border-border-hairline bg-surface shrink-0 flex gap-1 overflow-x-auto">
        {([
          { id: "overview", label: "Overview" },
          { id: "details", label: "JD & Activity" },
          { id: "documents", label: "Documents" },
          { id: "outreach", label: "Outreach" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-3 text-[14px] font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === tab.id
                ? "text-on-surface border-primary"
                : "text-on-surface-variant border-transparent hover:bg-[var(--ghost-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop max-w-content-max w-full mx-auto">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-gutter pb-6">
            <div className="md:col-span-4 flex flex-col gap-2">
              <div className="li-card p-4 flex flex-col gap-3">
                <h2 className="li-section-title">Application Details</h2>
                <div className="space-y-3">
                  <ApplicationStatusSelect
                    applicationId={application.id}
                    currentStatus={application.status}
                  />
                  <div>
                    <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">
                      Date Created
                    </span>
                    <p className="text-[14px] text-on-surface mt-1">
                      {formatAppDateTime(application.created_at)}
                    </p>
                  </div>
                  {application.job_url && (
                    <div>
                      <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">
                        Source Link
                      </span>
                      <a
                        href={application.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[14px] text-primary hover:underline mt-1 flex items-center gap-1 truncate"
                      >
                        {application.job_url}
                        <span className="material-symbols-outlined text-[14px]">
                          open_in_new
                        </span>
                      </a>
                    </div>
                  )}
                  {application.notes && !application.notes_html && (
                    <div>
                      <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider">
                        Personal Notes (legacy)
                      </span>
                      <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant mt-1">
                        <p className="text-[12px] text-on-surface whitespace-pre-wrap">
                          {application.notes}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-outline-variant">
                  <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider block mb-2">
                    Notes
                  </span>
                  <ApplicationNotesEditor
                    applicationId={application.id}
                    initialNotes={application.notes}
                    initialHtml={application.notes_html}
                  />
                </div>

                {application.jd_parsed?.must_have_keywords && (
                  <div className="pt-2 border-t border-outline-variant">
                    <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider block mb-2">
                      Target Keywords
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {application.jd_parsed.must_have_keywords.slice(0, 8).map((kw) => (
                        <span
                          key={kw}
                          className="li-chip bg-primary-container text-primary border border-transparent"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-4 flex flex-col gap-2">
              <div className="li-card p-4 flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="li-section-title">Recent activity</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("details")}
                    className="text-[12px] text-primary hover:underline"
                  >
                    View all
                  </button>
                </div>
                <ApplicationTimeline events={timelineEvents.slice(-5)} />
              </div>
            </div>

            <div className="md:col-span-4 flex flex-col gap-2">
              <div className="li-card p-4 flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="li-section-title">Resume Versions</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("documents")}
                    className="text-primary hover:bg-[var(--ghost-hover)] p-1 rounded-lg transition-colors"
                    title="Manage"
                  >
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {resumeVersions.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">No resumes generated.</p>
                  ) : (
                    resumeVersions.slice(0, 3).map((v) => (
                      <div
                        key={v.id}
                        className="bg-surface-container-low border border-outline-variant rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-on-surface-variant">
                              description
                            </span>
                            <span className="text-[14px] font-medium text-on-surface">
                              v{v.version}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              v.status === "ready"
                                ? "bg-secondary-container text-on-secondary-container"
                                : "bg-surface-variant text-on-surface-variant"
                            }`}
                          >
                            {v.status}
                          </span>
                        </div>
                        {v.status === "ready" && (
                          <div className="flex justify-end gap-3">
                            <a
                              href={`/api/applications/${application.id}/resume/${v.version}/pdf`}
                              className="text-[12px] font-semibold text-primary hover:underline"
                            >
                              Download PDF
                            </a>
                            <a
                              href={`/api/applications/${application.id}/resume/${v.version}/open`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] font-medium text-on-surface-variant hover:text-primary hover:underline"
                            >
                              Open
                            </a>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="pb-6 space-y-3">
            <AutoApplyOnlyHint />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <div className="li-card p-4 space-y-3">
                <h2 className="li-section-title">Resumes</h2>
                <ResumeArtifacts
                  applicationId={application.id}
                  versions={resumeVersions}
                />
              </div>
              <div className="li-card p-4 space-y-3">
                <h2 className="li-section-title">Cover letters</h2>
                <CoverLetterArtifacts
                  applicationId={application.id}
                  versions={coverLetterVersions}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "outreach" && (
          <div className="pb-6 space-y-3">
            <AutoApplyOnlyHint />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-4 li-card p-4 space-y-3">
                <h2 className="li-section-title">Contacts</h2>
                <ContactArtifacts contacts={contacts} />
              </div>
              <div className="lg:col-span-8 space-y-3">
                <div className="li-card p-4 space-y-3">
                  <h2 className="li-section-title">Cold emails</h2>
                  <EmailArtifacts emails={emails} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start pb-6">
            <div className="lg:col-span-7 space-y-3">
              <h2 className="li-section-title">Job description</h2>
              {(application.company || application.role || application.jd_parsed) && (
                <div className="li-card p-4 text-[13px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <p>
                    <span className="text-on-surface-variant">Company:</span>{" "}
                    {application.company || application.jd_parsed?.company || "-"}
                  </p>
                  <p>
                    <span className="text-on-surface-variant">Role:</span>{" "}
                    {application.role || application.jd_parsed?.role || "-"}
                  </p>
                </div>
              )}
              <pre className="whitespace-pre-wrap li-card-flat p-4 text-[12px] text-on-surface max-h-[min(70vh,640px)] overflow-y-auto bg-canvas">
                {application.jd_raw}
              </pre>
            </div>
            <div className="lg:col-span-5 li-card p-4 space-y-4">
              <h2 className="li-section-title">Activity timeline</h2>
              <ApplicationTimeline events={timelineEvents} />
              <div className="pt-3 border-t border-border-muted">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="text-[13px] text-error font-semibold hover:underline disabled:opacity-50"
                >
                  Delete application
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
