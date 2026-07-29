"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createApplication,
  type CreateApplicationInput,
} from "@/app/actions/applications";
import { getSimilarApplications } from "@/app/actions/tracker";
import type { Application } from "@/lib/db/types";
import { JD_SOFT_CAP } from "@/lib/tracker/jd";

export function ApplicationForm() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [similarApps, setSimilarApps] = useState<Application[]>([]);
  const [confirmDuplicates, setConfirmDuplicates] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(force = false) {
    setError(null);
    if (!force) setConfirmDuplicates(false);

    const input: CreateApplicationInput = {
      jd,
      company: company || undefined,
      role: role || undefined,
      job_url: jobUrl || undefined,
      notes: notes || undefined,
    };

    startTransition(async () => {
      if (!force) {
        const similar = await getSimilarApplications(company, role);
        if (similar.length > 0) {
          setSimilarApps(similar);
          setConfirmDuplicates(true);
          return;
        }
      }

      const result = await createApplication(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/applications/${result.id}`);
    });
  }

  const jdTooLong = jd.length > JD_SOFT_CAP;

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-margin-desktop overflow-hidden min-h-0">
      {/* Left Panel: Job Description (55%) */}
      <section className="w-full lg:w-[55%] flex flex-col bg-surface-container rounded-lg border border-outline-variant relative h-full">
        <div className="px-internal-padding py-internal-padding border-b border-outline-variant bg-surface-container-low rounded-t-lg shrink-0">
          <h2 className="text-[16px] font-medium leading-[24px] text-on-surface">Job Description</h2>
        </div>
        <div className="flex-1 relative p-internal-padding">
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="w-full h-full resize-none bg-surface-container-high text-on-surface border border-outline-variant rounded p-internal-padding text-[14px] leading-[20px] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-on-surface-variant transition-colors"
            placeholder="Paste the full job description here..."
            required
          />
        </div>
        <div className="px-internal-padding py-compact-gap bg-surface-container-low rounded-b-lg shrink-0 flex justify-end">
          <span className={`text-[11px] font-medium leading-[16px] ${jdTooLong ? "text-error" : "text-on-surface-variant"}`}>
            {jd.length.toLocaleString()} / {JD_SOFT_CAP.toLocaleString()}
            {jdTooLong ? " - will be truncated on save" : ""}
          </span>
        </div>
      </section>

      {/* Right Panel: Details Form (45%) */}
      <section className="w-full lg:w-[45%] flex flex-col bg-surface-container rounded-lg border border-outline-variant h-full overflow-hidden">
        <div className="px-internal-padding py-internal-padding border-b border-outline-variant bg-surface-container-low rounded-t-lg shrink-0">
          <h2 className="text-[16px] font-medium leading-[24px] text-on-surface">Application Details</h2>
        </div>
        <div className="flex-1 p-internal-padding flex flex-col gap-compact-gap overflow-y-auto">
          {/* Company */}
          <div className="flex flex-col gap-1">
            <label htmlFor="company" className="text-[12px] font-medium leading-[16px] text-on-surface">Company Name</label>
            <input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="bg-surface-container-high text-on-surface border-b border-outline focus:border-primary px-internal-padding py-compact-gap rounded-t text-[14px] leading-[20px] focus:outline-none transition-colors"
              placeholder="e.g. Acme Corp"
              type="text"
            />
          </div>
          {/* Role */}
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-[12px] font-medium leading-[16px] text-on-surface">Role / Title</label>
            <input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-surface-container-high text-on-surface border-b border-outline focus:border-primary px-internal-padding py-compact-gap rounded-t text-[14px] leading-[20px] focus:outline-none transition-colors"
              placeholder="e.g. Senior Frontend Engineer"
              type="text"
            />
          </div>
          {/* Job URL */}
          <div className="flex flex-col gap-1">
            <label htmlFor="job_url" className="text-[12px] font-medium leading-[16px] text-on-surface">Job Posting URL</label>
            <input
              id="job_url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="bg-surface-container-high text-on-surface border-b border-outline focus:border-primary px-internal-padding py-compact-gap rounded-t text-[14px] leading-[20px] focus:outline-none transition-colors"
              placeholder="https://..."
              type="url"
            />
          </div>
          {/* Notes */}
          <div className="flex flex-col gap-1 flex-1 min-h-[120px]">
            <label htmlFor="notes" className="text-[12px] font-medium leading-[16px] text-on-surface">Personal Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-full resize-none bg-surface-container-high text-on-surface border-b border-outline focus:border-primary rounded-t p-internal-padding text-[14px] leading-[20px] focus:outline-none placeholder-on-surface-variant transition-colors"
              placeholder="Key requirements, salary range, etc..."
            />
          </div>
          
          {confirmDuplicates && similarApps.length > 0 && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4 space-y-2">
              <p className="text-[13px] font-medium text-on-surface">
                Similar applications already exist
              </p>
              <ul className="text-[12px] text-on-surface-variant space-y-1">
                {similarApps.map((app) => (
                  <li key={app.id}>
                    <Link href={`/applications/${app.id}`} className="text-primary hover:underline">
                      {app.company || "Company"} - {app.role || "Role"}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-[12px]"
                >
                  Create anyway
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDuplicates(false)}
                  className="px-4 py-1.5 rounded-full text-[12px] text-on-surface-variant"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-error-container text-on-error-container rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <footer className="h-16 flex items-center justify-end px-4 bg-surface-container-low border-t border-outline-variant gap-4 shrink-0">
          <Link
            href="/applications"
            className="px-6 py-2 rounded-full border border-outline text-[14px] font-medium leading-[20px] text-primary hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={() => handleSubmit(false)}
            disabled={pending || !jd.trim() || confirmDuplicates}
            className="px-6 py-2 rounded-full bg-primary text-[14px] font-medium leading-[20px] text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Creating..." : "Create Application"}
          </button>
        </footer>
      </section>
    </div>
  );
}
