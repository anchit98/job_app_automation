"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { upsertProfile, syncSignatureLinksFromResume } from "@/app/actions/profile";
import { upsertMasterResume } from "@/app/actions/master-resume";
import { syncMasterFromGoogleDoc } from "@/app/actions/master-resume-sync";
import { syncCoverLetterFromGoogleDoc } from "@/app/actions/cover-letter-sync";
import { setSetupGuideCollapsed } from "@/app/actions/setup";
import { ProfileAvatarUploader } from "@/components/profile/profile-avatar-uploader";
import { GoogleAccountMenu } from "@/components/google/google-account-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileAvatarSrc } from "@/lib/profile-avatar";
import { parseGoogleDocsUrl } from "@/lib/google/docs-url";
import { formatAppDateTime } from "@/lib/datetime/india";
import { profileFieldsComplete } from "@/lib/setup/profile-complete";
import type { MasterCoverLetter, MasterResume, Profile } from "@/lib/db/types";

const RESUME_STRUCTURE_REF_URL =
  "https://docs.google.com/document/d/1qZ9eluvDK-hu-QeBskgL-g7FJEeKpuLUlVouVWp3p88/edit?usp=sharing";
const COVER_LETTER_STRUCTURE_REF_URL =
  "https://docs.google.com/document/d/1I1Zo1xL93XYaL9vMT6fI7RHuUb-_YZL5aaW5nIne9Bo/edit?usp=sharing";

interface OnboardingFormsProps {
  profile: Profile | null;
  masterResume: MasterResume | null;
  masterCoverLetter: MasterCoverLetter | null;
  isAdmin?: boolean;
  googleConnected: boolean;
  setupReady: boolean;
  justConnected?: boolean;
  googleError?: string | null;
}

function blankMasterResumeJson(): string {
  return "{\n}\n";
}

function hasMasterResumeContent(content: Record<string, unknown> | null | undefined) {
  if (!content) return false;
  return Object.keys(content).length > 0;
}

export function OnboardingForms({
  profile,
  masterResume,
  masterCoverLetter,
  isAdmin = false,
  googleConnected,
  setupReady,
  justConnected = false,
  googleError = null,
}: OnboardingFormsProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? "");
  const [githubUrl, setGithubUrl] = useState(profile?.github_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile?.portfolio_url ?? "");
  const [resumeJson, setResumeJson] = useState(() =>
    hasMasterResumeContent(masterResume?.content)
      ? JSON.stringify(masterResume!.content, null, 2)
      : blankMasterResumeJson(),
  );
  const [message, setMessage] = useState<string | null>(
    justConnected ? "Google connected — finish your profile below." : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [docId, setDocId] = useState(() => {
    const layout = masterResume?.doc_layout as { master_doc_id?: string } | null;
    return layout?.master_doc_id ?? "";
  });
  const [syncing, startSync] = useTransition();
  const [coverLetterDocId, setCoverLetterDocId] = useState(() => {
    const layout = masterCoverLetter?.doc_layout as { master_doc_id?: string } | null;
    return layout?.master_doc_id ?? "";
  });
  const [syncingCoverLetter, startCoverLetterSync] = useTransition();
  const [resumeSynced, setResumeSynced] = useState(
    hasMasterResumeContent(masterResume?.content),
  );
  const [minimized, setMinimized] = useState(
    Boolean(profile?.setup_guide_collapsed),
  );
  const [panelOpen, setPanelOpen] = useState(false);

  const profileDone = profileFieldsComplete({
    full_name: fullName,
    location,
    phone,
    linkedin_url: linkedinUrl,
  });
  const masterDone = resumeSynced || hasMasterResumeContent(masterResume?.content);

  const checklistSteps = [
    {
      done: googleConnected,
      label: "1. Connect Google",
      hint: "Drive, Docs & Gmail drafts",
    },
    {
      done: profileDone,
      label: "2. Save profile",
      hint: "Name, location, phone & LinkedIn",
    },
    {
      done: masterDone,
      label: "3. Sync master resume",
      hint: "Paste your Google Doc URL",
    },
  ];
  const completedCount = checklistSteps.filter((s) => s.done).length;
  const progressPercent = Math.round(
    (completedCount / checklistSteps.length) * 100,
  );

  function persistMinimized(next: boolean) {
    setMinimized(next);
    if (next) setPanelOpen(false);
    void setSetupGuideCollapsed(next).catch(() => {
      setMinimized(!next);
    });
  }

  function validateProfileFields(): string | null {
    if (!fullName.trim()) return "Full name is required.";
    if (!location.trim()) return "Location is required.";
    if (!phone.trim()) return "Contact number is required.";
    if (!linkedinUrl.trim()) return "LinkedIn URL is required.";
    return null;
  }

  function profilePayload() {
    return {
      full_name: fullName,
      headline,
      location,
      phone,
      linkedin_url: linkedinUrl,
      github_url: githubUrl,
      portfolio_url: portfolioUrl,
    };
  }

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

  function saveProfileOnly() {
    setError(null);
    setMessage(null);
    const validationError = validateProfileFields();
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        await upsertProfile(profilePayload());
        setMessage("Profile saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function saveAll() {
    setError(null);
    setMessage(null);

    const validationError = validateProfileFields();
    if (validationError) {
      setError(validationError);
      return;
    }

    let content: Record<string, unknown>;
    try {
      content = JSON.parse(resumeJson) as Record<string, unknown>;
    } catch {
      setError("Master resume must be valid JSON.");
      return;
    }

    startTransition(async () => {
      try {
        await upsertProfile(profilePayload());
        await upsertMasterResume({ content });
        setResumeSynced(Object.keys(content).length > 0);
        setMessage("Profile and master resume saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="li-page-title">Profile</h1>
        <div className="relative flex items-center gap-2 shrink-0">
            {minimized ? (
              <div className="relative">
                {panelOpen ? (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(100vw-2rem,17.5rem)] rounded-2xl border border-border-hairline bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.14)] p-3 space-y-2.5"
                    role="dialog"
                    aria-label="Setup progress"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`material-symbols-outlined text-[20px] shrink-0 ${
                            setupReady ? "text-success" : "text-primary"
                          }`}
                        >
                          {setupReady ? "check_circle" : "checklist"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-on-surface leading-tight">
                            Setup
                          </p>
                          <p className="text-[11px] text-on-surface-variant leading-tight">
                            {completedCount}/{checklistSteps.length}
                            {setupReady ? " · Done" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface transition-colors"
                          onClick={() => persistMinimized(false)}
                          aria-label="Open full setup checklist"
                          title="Open full checklist"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            open_in_full
                          </span>
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface transition-colors"
                          onClick={() => setPanelOpen(false)}
                          aria-label="Close setup panel"
                          title="Close"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            remove
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="w-full h-1 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <ul className="space-y-0.5">
                      {checklistSteps.map((step) => (
                        <li key={step.label}>
                          <div className="flex items-center gap-2 rounded-md px-1 py-1">
                            <span
                              className={`material-symbols-outlined text-[18px] shrink-0 ${
                                step.done
                                  ? "text-success"
                                  : "text-on-surface-variant"
                              }`}
                            >
                              {step.done
                                ? "check_circle"
                                : "radio_button_unchecked"}
                            </span>
                            <span
                              className={`text-[12px] leading-snug truncate ${
                                step.done
                                  ? "text-on-surface-variant"
                                  : "text-on-surface font-medium"
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {setupReady ? (
                      <Link
                        href="/apply"
                        className="li-btn-primary text-[12px] no-underline w-full justify-center"
                      >
                        Start Apply
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setPanelOpen((v) => !v)}
                  className={`inline-flex h-11 items-center gap-1.5 rounded-full border pl-2 pr-3 transition-colors ${
                    setupReady
                      ? "border-success/40 bg-success-container/50 text-success hover:bg-success-container"
                      : "border-border-hairline bg-surface-container-low text-on-surface hover:bg-[var(--ghost-hover)]"
                  }`}
                  aria-expanded={panelOpen}
                  aria-label={
                    panelOpen ? "Close setup checklist" : "Open setup checklist"
                  }
                  title="Setup progress"
                >
                  <span className="material-symbols-outlined text-[20px] leading-none">
                    {setupReady ? "check_circle" : "checklist"}
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums">
                    {completedCount}/{checklistSteps.length}
                  </span>
                </button>
              </div>
            ) : null}

            <GoogleAccountMenu
              connected={googleConnected}
              googleError={googleError}
            />
        </div>
      </div>

      {!minimized ? (
        <div className="li-card p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="li-section-title">Setup</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {setupReady ? (
                <Link
                  href="/apply"
                  className="li-btn-primary text-[13px] no-underline"
                >
                  Start Apply
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-waiting/30 bg-status-waiting-container px-3 py-1.5 text-[12px] font-semibold text-status-waiting">
                  <span className="material-symbols-outlined text-[16px]">
                    lock
                  </span>
                  Dashboard &amp; Apply locked
                </span>
              )}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-hairline px-3 text-[13px] font-semibold text-on-surface transition-colors hover:bg-[var(--ghost-hover)]"
                onClick={() => persistMinimized(true)}
                aria-expanded={true}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">
                  keyboard_arrow_down
                </span>
                <span className="leading-none">Minimize</span>
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            {checklistSteps.map((step) => (
              <li
                key={step.label}
                className={`rounded-xl border px-3 py-2.5 ${
                  step.done
                    ? "border-success/30 bg-success-container/40"
                    : "border-border-hairline bg-surface-container-low"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-on-surface">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      step.done ? "text-success" : "text-on-surface-variant"
                    }`}
                  >
                    {step.done ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  {step.label}
                </div>
                <p className="li-meta mt-0.5 pl-6">{step.hint}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Profile */}
        <div className="lg:col-span-4 li-card p-4 space-y-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Step 2
            </span>
            <h2 className="li-section-title">Your profile</h2>
            <p className="li-meta">
              Full name, location, contact number, and LinkedIn are required.
              Optional links still help cold-email drafts.
            </p>
            <ProfileAvatarUploader
              avatarSrc={profileAvatarSrc(profile)}
              name={fullName || profile?.full_name}
              size={56}
            />
          </div>
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
                placeholder="e.g. Product Manager"
              />
            </div>
            <div>
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bengaluru, India"
                required
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border-muted space-y-3">
            <div>
              <h3 className="text-[13px] font-semibold text-on-surface">
                Contact &amp; signature
              </h3>
              <p className="li-meta mt-0.5">
                Phone and LinkedIn are required. GitHub and portfolio are
                optional extras for outreach drafts.
              </p>
            </div>
            <button
              type="button"
              onClick={pullLinksFromResume}
              disabled={pending || !masterDone}
              className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Pull links from master resume
            </button>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="phone">Contact number *</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-555-000-0000"
                  required
                />
              </div>
              <div>
                <Label htmlFor="linkedin_url">LinkedIn URL *</Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/..."
                  required
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
            onClick={isAdmin ? saveAll : saveProfileOnly}
            disabled={pending || !profileDone}
            className="w-full"
          >
            {pending ? "Saving..." : "Save profile"}
          </Button>
        </div>

        {/* Structure references (replaces JSON for normal users) */}
        <div className="lg:col-span-4 li-card p-4 space-y-3 flex flex-col min-h-[420px]">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Step 3 · prepare
            </span>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">
                library_books
              </span>
              <h2 className="li-section-title">Structure references</h2>
            </div>
            <p className="li-meta">
              Open these view-only templates, make a copy in your Drive, then
              rebuild your resume / cover letter to match the structure. Sync
              your Doc in the next column.
            </p>
          </div>
          <ul className="space-y-2 text-[13px]">
            <li>
              <a
                href={RESUME_STRUCTURE_REF_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">
                  open_in_new
                </span>
                Resume structure reference
              </a>
            </li>
            <li>
              <a
                href={COVER_LETTER_STRUCTURE_REF_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">
                  open_in_new
                </span>
                Cover letter structure reference
              </a>
            </li>
          </ul>
          <div className="rounded-lg border border-border-hairline bg-surface-container-low px-3 py-3 space-y-2 text-[13px] text-on-surface-variant leading-6">
            <p>
              <strong className="text-on-surface">How to do it</strong>
            </p>
            <ol className="list-decimal pl-4 space-y-1.5">
              <li>Open the resume reference → File → Make a copy (recommended)</li>
              <li>Or use any clear Google Docs resume you already have</li>
              <li>
                Paste your Doc URL into “Master resume Doc” and Sync — we adapt to
                your layout and keep your formatting on Apply
              </li>
            </ol>
          </div>
          <p className="li-meta mt-auto rounded-md border border-border-hairline bg-surface-container-low px-3 py-2">
            Links are <strong>view only</strong>. Always work in your own copy.
            Google Docs sync best when you build in Docs (not Word/PDF paste).
          </p>
        </div>

        {/* Master docs */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="li-card p-4 space-y-3">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Step 3 · sync
              </span>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  description
                </span>
                <h2 className="li-section-title">Master resume Doc</h2>
              </div>
            </div>
            <p className="li-meta">
              Required. Paste your Google Doc URL, then Sync. Sync flags ATS
              issues (e.g. missing Experience bullets) before saving.
            </p>
            <div>
              <Label>Google Docs URL</Label>
              <Input
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="https://docs.google.com/document/d/<ID>/edit"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="li-meta uppercase tracking-wide block">
                  Last sync
                </span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {masterResume?.doc_synced_at
                    ? formatAppDateTime(masterResume.doc_synced_at)
                    : masterDone
                      ? "Ready"
                      : "Never synced"}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  const parsed = parseGoogleDocsUrl(docId);
                  if (!parsed.ok) {
                    setError(parsed.error);
                    return;
                  }
                  if (!googleConnected) {
                    setError("Connect Google first (step 1).");
                    return;
                  }
                  startSync(async () => {
                    try {
                      const res = await syncMasterFromGoogleDoc(parsed.docId);
                      if (res.content) {
                        setResumeJson(JSON.stringify(res.content, null, 2));
                        setResumeSynced(Object.keys(res.content).length > 0);
                      }
                      setMessage(
                        `Synced ${res.slots} editable slots (${res.experience_roles} roles, ${res.projects} projects, ${res.skills} skills)${
                          res.sync_mode === "smart_agent"
                            ? " · adapted to your Doc layout"
                            : ""
                        }.`,
                      );
                      router.refresh();
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
              Recommended. Greeting + exactly 5 body paragraphs + Warm regards.
              Sync flags ATS readiness before saving.
            </p>
            <div>
              <Label>Google Docs URL</Label>
              <Input
                value={coverLetterDocId}
                onChange={(e) => setCoverLetterDocId(e.target.value)}
                placeholder="https://docs.google.com/document/d/<ID>/edit"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="li-meta uppercase tracking-wide block">
                  Last sync
                </span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {masterCoverLetter?.doc_synced_at
                    ? formatAppDateTime(masterCoverLetter.doc_synced_at)
                    : "Never synced"}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  const parsed = parseGoogleDocsUrl(coverLetterDocId);
                  if (!parsed.ok) {
                    setError(parsed.error);
                    return;
                  }
                  if (!googleConnected) {
                    setError("Connect Google first (step 1).");
                    return;
                  }
                  startCoverLetterSync(async () => {
                    try {
                      const res = await syncCoverLetterFromGoogleDoc(parsed.docId);
                      setMessage(
                        `Cover letter template synced - ${res.body_slots} body slots mapped.`,
                      );
                      router.refresh();
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

      {/* Admin-only JSON editor */}
      {isAdmin ? (
        <div className="li-card p-4 space-y-3">
          <div>
            <h2 className="li-section-title">Master resume (JSON) · Admin</h2>
            <p className="li-meta mt-1">
              Hidden for normal users. Edit only if Doc sync needs a manual fix.
            </p>
          </div>
          <textarea
            value={resumeJson}
            onChange={(e) => setResumeJson(e.target.value)}
            className="min-h-[240px] w-full resize-y bg-canvas text-on-surface border border-border-hairline rounded-lg p-3 font-mono text-[12px] focus:outline-none focus:border-primary"
          />
          <Button type="button" onClick={saveAll} disabled={pending}>
            {pending ? "Saving..." : "Save JSON"}
          </Button>
        </div>
      ) : null}

      {message && (
        <div className="fixed bottom-4 right-4 z-50 bg-success-container text-on-success-container border border-success/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-error-container text-on-error-container border border-error/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm whitespace-pre-line">
          {error}
        </div>
      )}
    </div>
  );
}
