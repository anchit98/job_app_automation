"use client";

import { useState, useTransition } from "react";
import { upsertProfile, syncSignatureLinksFromResume } from "@/app/actions/profile";
import { upsertMasterResume } from "@/app/actions/master-resume";
import { syncMasterFromGoogleDoc } from "@/app/actions/master-resume-sync";
import { syncCoverLetterFromGoogleDoc } from "@/app/actions/cover-letter-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MasterCoverLetter, MasterResume, Profile } from "@/lib/db/types";

interface OnboardingFormsProps {
  profile: Profile | null;
  masterResume: MasterResume | null;
  masterCoverLetter: MasterCoverLetter | null;
  defaultResumeContent?: Record<string, unknown>;
  defaultMasterDocId?: string;
  defaultCoverLetterDocId?: string;
}

export function OnboardingForms({
  profile,
  masterResume,
  masterCoverLetter,
  defaultResumeContent,
  defaultMasterDocId = "",
  defaultCoverLetterDocId = "",
}: OnboardingFormsProps) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [timezone, setTimezone] = useState(
    profile?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC",
  );
  const [phone, setPhone] = useState(profile?.phone ?? "+91-99109-80793");
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? "");
  const [githubUrl, setGithubUrl] = useState(profile?.github_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile?.portfolio_url ?? "");
  const [resumeJson, setResumeJson] = useState(
    JSON.stringify(
      masterResume?.content ?? defaultResumeContent ?? { experience: [], projects: [], skills: [], education: [] },
      null,
      2,
    ),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState(() => {
    const layout = masterResume?.doc_layout as { master_doc_id?: string } | null;
    return layout?.master_doc_id ?? defaultMasterDocId;
  });
  const [syncing, startSync] = useTransition();
  const [coverLetterDocId, setCoverLetterDocId] = useState(() => {
    const layout = masterCoverLetter?.doc_layout as { master_doc_id?: string } | null;
    return layout?.master_doc_id ?? defaultCoverLetterDocId;
  });
  const [syncingCoverLetter, startCoverLetterSync] = useTransition();

  function pullLinksFromResume() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await syncSignatureLinksFromResume({ overwrite: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.fields) {
        if (result.fields.phone) setPhone(result.fields.phone);
        if (result.fields.linkedin_url) setLinkedinUrl(result.fields.linkedin_url);
        if (result.fields.github_url) setGithubUrl(result.fields.github_url);
        if (result.fields.portfolio_url) setPortfolioUrl(result.fields.portfolio_url);
      }
      setMessage("Signature links pulled from master resume.");
    });
  }

  function saveAll() {
    setError(null);
    setMessage(null);

    let content: Record<string, unknown>;
    try {
      content = JSON.parse(resumeJson) as Record<string, unknown>;
    } catch {
      setError("Master resume must be valid JSON.");
      return;
    }

    startTransition(async () => {
      try {
        await upsertProfile({
          full_name: fullName,
          headline,
          location,
          timezone,
          phone,
          linkedin_url: linkedinUrl,
          github_url: githubUrl,
          portfolio_url: portfolioUrl,
        });
        await upsertMasterResume({ content });
        setMessage("Profile and master resume saved.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Profile */}
        <div className="lg:col-span-4 li-card p-4 space-y-4">
          <h2 className="li-section-title">Profile</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
            <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border-muted space-y-3">
            <div>
              <h3 className="text-[13px] font-semibold text-on-surface">Email signature</h3>
              <p className="li-meta mt-0.5">
                Appended to cold-email drafts. Pull links from master resume when needed.
              </p>
            </div>
            <button
              type="button"
              onClick={pullLinksFromResume}
              disabled={pending}
              className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Pull links from master resume
            </button>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="phone">Contact number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91-99109-80793"
                />
              </div>
              <div>
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="github_url">GitHub URL</Label>
                <Input
                  id="github_url"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="portfolio_url">Portfolio URL</Label>
                <Input
                  id="portfolio_url"
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={saveAll}
            disabled={pending || !fullName.trim()}
            className="w-full"
          >
            {pending ? "Saving..." : "Save profile"}
          </Button>
        </div>

        {/* Master resume JSON */}
        <div className="lg:col-span-4 li-card p-4 space-y-3 flex flex-col min-h-[480px]">
          <div>
            <h2 className="li-section-title">Master resume (JSON)</h2>
            <p className="li-meta mt-1">
              Auto-populated from Google Doc sync. Edit manually if needed.
            </p>
          </div>
          <textarea
            value={resumeJson}
            onChange={(e) => setResumeJson(e.target.value)}
            className="flex-1 min-h-[320px] w-full resize-none bg-canvas text-on-surface border border-border-hairline rounded-lg p-3 font-mono text-[12px] focus:outline-none focus:border-primary"
          />
          <Button type="button" onClick={saveAll} disabled={pending} className="w-full">
            {pending ? "Saving..." : "Save JSON"}
          </Button>
        </div>

        {/* Google Doc syncs */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="li-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">description</span>
              <h2 className="li-section-title">Master resume Doc</h2>
            </div>
            <p className="li-meta">
              Sync experience from a Google Doc into structured resume slots.
            </p>
            <div>
              <Label>Google Doc URL</Label>
              <Input
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="https://docs.google.com/document/d/<ID>/edit"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="li-meta uppercase tracking-wide block">Last sync</span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {masterResume?.doc_synced_at
                    ? new Date(masterResume.doc_synced_at).toLocaleString()
                    : "Never synced"}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  const rawId = extractDocId(docId);
                  if (!rawId) {
                    setError("Enter a valid Google Doc ID or URL.");
                    return;
                  }
                  startSync(async () => {
                    try {
                      const res = await syncMasterFromGoogleDoc(rawId);
                      setMessage(
                        `Synced ${res.slots} editable slots (${res.experience_roles} roles, ${res.projects} projects).`,
                      );
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Sync failed");
                    }
                  });
                }}
                disabled={syncing}
              >
                {syncing ? "Syncing..." : "Sync Doc"}
              </Button>
            </div>
          </div>

          <div className="li-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">mail</span>
              <h2 className="li-section-title">Cover letter Doc</h2>
            </div>
            <p className="li-meta">
              Greeting + body paragraphs + sign-off template.
            </p>
            <div>
              <Label>Google Doc URL</Label>
              <Input
                value={coverLetterDocId}
                onChange={(e) => setCoverLetterDocId(e.target.value)}
                placeholder="https://docs.google.com/document/d/<ID>/edit"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="li-meta uppercase tracking-wide block">Last sync</span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {masterCoverLetter?.doc_synced_at
                    ? new Date(masterCoverLetter.doc_synced_at).toLocaleString()
                    : "Never synced"}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  const rawId = extractDocId(coverLetterDocId);
                  if (!rawId) {
                    setError("Enter a valid cover letter Google Doc ID.");
                    return;
                  }
                  startCoverLetterSync(async () => {
                    try {
                      const res = await syncCoverLetterFromGoogleDoc(rawId);
                      setMessage(
                        `Cover letter template synced — ${res.body_slots} body slots mapped.`,
                      );
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Sync failed");
                    }
                  });
                }}
                disabled={syncingCoverLetter}
              >
                {syncingCoverLetter ? "Syncing..." : "Sync Doc"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="fixed bottom-4 right-4 bg-success-container text-on-success-container border border-success/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm z-50">
          {message}
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 bg-error-container text-on-error-container border border-error/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm z-50">
          {error}
        </div>
      )}
    </div>
  );
}

function extractDocId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}
