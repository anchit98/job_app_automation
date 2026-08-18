"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { upsertProfile, upsertProfileBasics } from "@/app/actions/profile";
import { upsertMasterResume } from "@/app/actions/master-resume";
import {
  syncMasterFromGoogleDoc,
  syncMasterFromDriveFile,
  syncMasterFromPdfUpload,
} from "@/app/actions/master-resume-sync";
import {
  syncCoverLetterFromDriveFile,
  syncCoverLetterFromUpload,
} from "@/app/actions/cover-letter-sync";
import { setSetupGuideCollapsed, resetSetupAll, resetSetupCoverLetter, resetSetupMasterResume, resetSetupProfile } from "@/app/actions/setup";
import { ProfileAvatarUploader } from "@/components/profile/profile-avatar-uploader";
import { GoogleAccountMenu } from "@/components/google/google-account-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileAvatarSrc } from "@/lib/profile-avatar";
import { formatAppDateTime } from "@/lib/datetime/india";
import { linkedinUrlError } from "@/lib/contacts/validate";
import {
  GOOGLE_DOC_MIME,
  GoogleDocPickerButton,
} from "@/components/google/google-doc-picker";
import { setCvAsMasterResume } from "@/app/actions/builder";
import type { BuilderCvVersion } from "@/lib/builder/queries";
import type { MasterCoverLetter, MasterResume, Profile } from "@/lib/db/types";

/**
 * One server round trip does convert → rebuild → sync, so this step text is
 * time-based; it only sets expectations during the slow Google calls.
 */
const PDF_IMPORT_STEPS: Array<[number, string]> = [
  [6000, "Rebuilding the Doc with proper bullets…"],
  [14000, "Reading your resume structure…"],
  [26000, "Almost there — saving your master resume…"],
];

const RESUME_STRUCTURE_REF_URL =
  "https://docs.google.com/document/d/1qZ9eluvDK-hu-QeBskgL-g7FJEeKpuLUlVouVWp3p88/edit?usp=sharing";
const COVER_LETTER_STRUCTURE_REF_URL =
  "https://docs.google.com/document/d/1I1Zo1xL93XYaL9vMT6fI7RHuUb-_YZL5aaW5nIne9Bo/edit?usp=sharing";

interface OnboardingFormsProps {
  profile: Profile | null;
  masterResume: MasterResume | null;
  masterCoverLetter: MasterCoverLetter | null;
  /** Newest builder CV, offered here so setup can finish in one place. */
  latestBuilderCv?: BuilderCvVersion | null;
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
  latestBuilderCv = null,
  isAdmin = false,
  googleConnected,
  setupReady,
  justConnected = false,
  googleError = null,
}: OnboardingFormsProps) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url ?? "");
  const [linkedinBlurError, setLinkedinBlurError] = useState<string | null>(null);
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
  const [syncing, startSync] = useTransition();
  const [syncingCoverLetter, startCoverLetterSync] = useTransition();
  const resumePdfInputRef = useRef<HTMLInputElement | null>(null);
  /** Set after a PDF upload so the user can open and correct the conversion. */
  const [convertedDocUrl, setConvertedDocUrl] = useState<string | null>(null);
  const coverLetterFileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverConvertedDocUrl, setCoverConvertedDocUrl] = useState<
    string | null
  >(null);
  /**
   * In-progress text for slow Google round trips. Kept apart from `message`
   * so a running job never renders in the green success toast.
   */
  const [busy, setBusy] = useState<string | null>(null);
  const [resumeSynced, setResumeSynced] = useState(
    hasMasterResumeContent(masterResume?.content),
  );
  const [resumeSyncedAt, setResumeSyncedAt] = useState<string | null>(
    masterResume?.doc_synced_at ?? null,
  );
  const [coverSyncedAt, setCoverSyncedAt] = useState<string | null>(
    masterCoverLetter?.doc_synced_at ?? null,
  );
  // Incomplete setup always starts expanded so post-payment onboarding is clear.
  // Collapsed preference only applies after setup is finished.
  const [minimized, setMinimized] = useState(() =>
    setupReady ? Boolean(profile?.setup_guide_collapsed) : false,
  );
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!setupReady && profile?.setup_guide_collapsed) {
      void setSetupGuideCollapsed(false).catch(() => {});
    }
  }, [setupReady, profile?.setup_guide_collapsed]);

  const basicsDone = Boolean(fullName.trim() && location.trim());
  const contactDone = Boolean(
    phone.trim() && linkedinUrl.trim() && !linkedinUrlError(linkedinUrl),
  );
  const masterDone = resumeSynced || hasMasterResumeContent(masterResume?.content);

  const checklistSteps = [
    {
      done: googleConnected,
      label: "1. Connect Google",
      hint: "Drive, Docs & Gmail drafts",
    },
    {
      done: basicsDone,
      label: "2. Save profile",
      hint: "Name, headline & location",
    },
    {
      done: masterDone,
      label: "3. Sync documents",
      hint: "Resume required · cover optional",
    },
    {
      done: contactDone,
      label: "4. Contact & links",
      hint: "Phone & LinkedIn required",
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

  function clearProfileFieldsLocal() {
    setFullName("");
    setHeadline("");
    setLocation("");
    setPhone("");
    setLinkedinUrl("");
    setGithubUrl("");
    setPortfolioUrl("");
  }

  function clearResumeFieldsLocal() {
    setResumeJson(blankMasterResumeJson());
    setResumeSynced(false);
    setResumeSyncedAt(null);
  }

  function clearCoverLetterFieldsLocal() {
    setCoverSyncedAt(null);
  }

  function applySignatureFields(fields: {
    phone: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    portfolio_url: string | null;
  } | null | undefined) {
    if (!fields) return false;
    let filled = false;
    if (fields.phone) {
      setPhone(fields.phone);
      filled = true;
    }
    if (fields.linkedin_url) {
      setLinkedinUrl(fields.linkedin_url);
      setLinkedinBlurError(null);
      filled = true;
    }
    if (fields.github_url) {
      setGithubUrl(fields.github_url);
      filled = true;
    }
    if (fields.portfolio_url) {
      setPortfolioUrl(fields.portfolio_url);
      filled = true;
    }
    return filled;
  }

  /** Shared by the Drive picker and the PDF upload — both end in a Doc sync. */
  function applyResumeSyncSuccess(
    res: Extract<
      Awaited<ReturnType<typeof syncMasterFromGoogleDoc>>,
      { ok: true }
    >,
    suffix = "",
  ) {
    if (res.content) {
      setResumeJson(JSON.stringify(res.content, null, 2));
      setResumeSynced(Object.keys(res.content).length > 0);
    }
    if (res.synced_at) setResumeSyncedAt(res.synced_at);
    const linksFilled = applySignatureFields(res.signature_fields);
    setMessage(
      `Synced ${res.slots} editable slots (${res.experience_roles} roles, ${res.projects} projects, ${res.skills} skills)${
        res.sync_mode === "smart_agent" ? " · adapted to your Doc layout" : ""
      }${linksFilled ? " · contact links filled from resume" : ""}.${suffix}`,
    );
  }

  /** Adopt a CV built in /builder as the master resume, without leaving setup. */
  function adoptBuilderCv(versionId: string) {
    setError(null);
    setMessage(null);
    setConvertedDocUrl(null);
    setBusy("Turning that CV into your master resume Doc…");
    const timers = PDF_IMPORT_STEPS.map(([ms, text]) =>
      setTimeout(() => setBusy(text), ms),
    );
    startSync(async () => {
      try {
        const res = await setCvAsMasterResume(versionId);
        if (!res.ok) {
          setError(res.error);
          setMessage(null);
          return;
        }
        setConvertedDocUrl(res.converted_doc_url);
        setResumeSynced(true);
        setResumeSyncedAt(new Date().toISOString());
        setMessage(
          `Master resume set from your built CV — ${res.slots} editable slots.`,
        );
      } catch (e) {
        setMessage(null);
        setError(e instanceof Error ? e.message : "Could not use that CV.");
      } finally {
        timers.forEach(clearTimeout);
        setBusy(null);
      }
    });
  }

  /** Shared by the cover letter Drive picker and device upload. */
  function applyCoverSyncSuccess(
    res: { body_slots: number; synced_at: string },
    isDoc: boolean,
  ) {
    if (res.synced_at) setCoverSyncedAt(res.synced_at);
    setMessage(
      `Cover letter template synced — ${res.body_slots} body slots mapped.${
        isDoc ? "" : " Check the converted Doc before your first Apply."
      }`,
    );
  }

  function runReset(
    kind: "profile" | "resume" | "cover" | "all",
    confirmMessage: string,
  ) {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        if (kind === "all") {
          await resetSetupAll();
          clearProfileFieldsLocal();
          clearResumeFieldsLocal();
          clearCoverLetterFieldsLocal();
        } else if (kind === "profile") {
          await resetSetupProfile();
          clearProfileFieldsLocal();
        } else if (kind === "resume") {
          await resetSetupMasterResume();
          clearResumeFieldsLocal();
        } else {
          await resetSetupCoverLetter();
          clearCoverLetterFieldsLocal();
        }
        setMessage(
          kind === "all"
            ? "Profile, resume, and cover letter values were reset."
            : kind === "profile"
              ? "Profile values were reset."
              : kind === "resume"
                ? "Master resume sync was reset."
                : "Cover letter sync was reset.",
        );
        // Do not router.refresh() here — production Flight + layout auth used
        // to surface an opaque Server Components digest error after reset/sync.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reset failed");
      }
    });
  }

  function validateBasicsFields(): string | null {
    if (!fullName.trim()) return "Full name is required.";
    if (!location.trim()) return "Location is required.";
    return null;
  }

  function validateContactFields(): string | null {
    if (!phone.trim()) return "Contact number is required.";
    if (!linkedinUrl.trim()) {
      setLinkedinBlurError("LinkedIn URL is required.");
      return "LinkedIn URL is required.";
    }
    const linkedinErr = linkedinUrlError(linkedinUrl);
    setLinkedinBlurError(linkedinErr);
    return linkedinErr;
  }

  function validateProfileFields(): string | null {
    return validateBasicsFields() ?? validateContactFields();
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

  function saveBasicsOnly() {
    setError(null);
    setMessage(null);
    const validationError = validateBasicsFields();
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        await upsertProfileBasics({
          full_name: fullName,
          headline,
          location,
        });
        setMessage("Profile saved.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function saveContactOnly() {
    setError(null);
    setMessage(null);
    const basicsError = validateBasicsFields();
    if (basicsError) {
      setError(`${basicsError} Save Step 2 first.`);
      return;
    }
    const validationError = validateContactFields();
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      try {
        await upsertProfile(profilePayload());
        setMessage("Contact & links saved.");
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
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                runReset(
                  "all",
                  "Reset all setup values (profile, resume Doc, and cover letter Doc)? This cannot be undone.",
                )
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-hairline px-3 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-[var(--ghost-hover)] hover:text-on-surface disabled:opacity-50"
              title="Reset profile, resume, and cover letter"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">
                restart_alt
              </span>
              <span className="leading-none hidden sm:inline">Reset all</span>
            </button>
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
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        {/* Profile basics */}
        <div className="lg:col-span-4 li-card p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Step 2
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runReset(
                    "profile",
                    "Reset all profile fields and remove your avatar?",
                  )
                }
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface disabled:opacity-50"
                title="Reset profile"
              >
                <span className="material-symbols-outlined text-[16px]">
                  restart_alt
                </span>
                Reset
              </button>
            </div>
            <h2 className="li-section-title">Your profile</h2>
            <ProfileAvatarUploader
              avatarSrc={profileAvatarSrc(profile)}
              name={fullName || profile?.full_name}
              size={56}
            />
          </div>
          <div className="grid gap-3">
            <div>
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
          <Button
            type="button"
            onClick={isAdmin ? saveAll : saveBasicsOnly}
            disabled={pending || !basicsDone}
            className="w-full"
          >
            {pending ? "Saving..." : "Save profile"}
          </Button>
        </div>

        {/* Master docs */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="li-card p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Step 3
                </span>
                <button
                  type="button"
                  disabled={pending || syncing}
                  onClick={() =>
                    runReset(
                      "resume",
                      "Clear the synced master resume data?",
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface disabled:opacity-50"
                  title="Reset master resume"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    restart_alt
                  </span>
                  Reset
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  description
                </span>
                <h2 className="li-section-title">Master resume Doc</h2>
              </div>
            </div>
            <a
              href={RESUME_STRUCTURE_REF_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]">
                open_in_new
              </span>
              Resume structure reference
            </a>
            {!masterDone ? (
              <Link
                href="/builder"
                className="flex items-center gap-3 rounded-xl border border-outline-variant p-3 hover:bg-[var(--ghost-hover)]"
              >
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  draw
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-on-surface">
                    No resume yet? Build one
                  </span>
                  <span className="block text-[12px] text-on-surface-variant">
                    Fill a form, pick your industry, get a PDF
                  </span>
                </span>
                <span
                  className="material-symbols-outlined text-[18px] text-on-surface-variant ml-auto"
                  aria-hidden
                >
                  chevron_right
                </span>
              </Link>
            ) : null}

            {latestBuilderCv ? (
              <div className="space-y-2">
                <span className="li-meta uppercase tracking-wide block">
                  Your latest built CV
                </span>
                <div className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2">
                  <span
                    className="material-symbols-outlined text-[18px] text-primary shrink-0"
                    aria-hidden
                  >
                    draw
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-on-surface capitalize">
                      {latestBuilderCv.professional_field ?? "general"}
                    </span>
                    <span className="block li-meta">
                      {formatAppDateTime(latestBuilderCv.created_at)}
                    </span>
                  </span>
                  {latestBuilderCv.synced_to_master_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-container px-2 py-0.5 text-[11px] font-semibold text-on-success-container">
                      <span
                        className="material-symbols-outlined text-[13px]"
                        aria-hidden
                      >
                        check
                      </span>
                      In use
                    </span>
                  ) : googleConnected ? (
                    <button
                      type="button"
                      onClick={() => adoptBuilderCv(latestBuilderCv.id)}
                      disabled={syncing}
                      className="shrink-0 li-btn-secondary text-[12px] disabled:opacity-50"
                    >
                      {syncing ? "Working…" : "Use this"}
                    </button>
                  ) : (
                    // A dead disabled button just looks broken — send the user
                    // to the one thing that unblocks it instead.
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/api/auth/google/start";
                      }}
                      className="shrink-0 li-btn-secondary text-[12px]"
                    >
                      Connect Google
                    </button>
                  )}
                </div>
                <Link
                  href="/builder"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                >
                  Edit or make another
                  <span
                    className="material-symbols-outlined text-[14px]"
                    aria-hidden
                  >
                    arrow_forward
                  </span>
                </Link>
              </div>
            ) : null}

            <div className="space-y-3">
              <span className="li-meta uppercase tracking-wide block">
                {masterDone ? "Import from" : "Already have one? Import from"}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <GoogleDocPickerButton
                  label={syncing ? "Syncing…" : "Drive"}
                  title="Choose master resume (Doc, PDF or Word)"
                  className="w-full justify-center"
                  disabled={!googleConnected || syncing}
                  onPicked={(doc) => {
                    setError(null);
                    setMessage(null);
                    setConvertedDocUrl(null);
                    const isDoc = doc.mimeType === GOOGLE_DOC_MIME;
                    setBusy(
                      isDoc
                        ? `Reading “${doc.name}”…`
                        : `Converting “${doc.name}” to a Google Doc…`,
                    );
                    const timers = isDoc
                      ? []
                      : PDF_IMPORT_STEPS.map(([ms, text]) =>
                          setTimeout(() => setBusy(text), ms),
                        );
                    startSync(async () => {
                      try {
                        const res = await syncMasterFromDriveFile(
                          doc.id,
                          doc.mimeType,
                        );
                        if (!res.ok) {
                          setError(res.error);
                          setMessage(null);
                          return;
                        }
                        if (!isDoc) setConvertedDocUrl(res.converted_doc_url);
                        applyResumeSyncSuccess(
                          res,
                          isDoc
                            ? ""
                            : " Check the converted Doc before your first Apply.",
                        );
                      } catch (e) {
                        setMessage(null);
                        setError(
                          e instanceof Error ? e.message : "Sync failed",
                        );
                      } finally {
                        timers.forEach(clearTimeout);
                        setBusy(null);
                      }
                    });
                  }}
                  onError={(msg) => setError(msg)}
                />
                <input
                  ref={resumePdfInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Allow re-picking the same file after a failed attempt.
                    e.target.value = "";
                    if (!file) return;
                    setError(null);
                    setMessage(null);
                    setConvertedDocUrl(null);
                    const sizeKb = Math.round(file.size / 1024);
                    setBusy(
                      `Uploading “${file.name}” (${sizeKb} KB) — converting to a Google Doc…`,
                    );
                    const timers = PDF_IMPORT_STEPS.map(([ms, text]) =>
                      setTimeout(() => setBusy(text), ms),
                    );
                    const form = new FormData();
                    form.set("resume_pdf", file);
                    startSync(async () => {
                      try {
                        const res = await syncMasterFromPdfUpload(form);
                        if (!res.ok) {
                          setError(res.error);
                          setMessage(null);
                          return;
                        }
                        setConvertedDocUrl(res.converted_doc_url);
                        applyResumeSyncSuccess(
                          res,
                          " Check the converted Doc before your first Apply.",
                        );
                      } catch (e) {
                        setMessage(null);
                        setError(
                          e instanceof Error ? e.message : "PDF upload failed",
                        );
                      } finally {
                        timers.forEach(clearTimeout);
                        setBusy(null);
                      }
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={!googleConnected || syncing}
                  onClick={() => resumePdfInputRef.current?.click()}
                  title="Pick a resume from this device — PDF or Word, converted to a Google Doc automatically"
                  className="inline-flex w-full items-center justify-center gap-1.5 li-btn-secondary text-[13px] disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      syncing ? "animate-spin" : ""
                    }`}
                    aria-hidden
                  >
                    {syncing ? "progress_activity" : "devices"}
                  </span>
                  {syncing ? "Working…" : "This device"}
                </button>
              </div>
              {!googleConnected ? <ConnectGoogleHint /> : null}
              <div className="flex items-baseline justify-between gap-2 border-t border-outline-variant pt-2">
                <span className="li-meta uppercase tracking-wide">
                  Last sync
                </span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {resumeSyncedAt
                    ? formatAppDateTime(resumeSyncedAt)
                    : masterDone
                      ? "Ready"
                      : "Never synced"}
                </span>
              </div>
            </div>
            {convertedDocUrl ? (
              <a
                href={convertedDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">
                  open_in_new
                </span>
                Open the converted Doc
              </a>
            ) : null}
          </div>

          <div className="li-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-primary">mail</span>
                <h2 className="li-section-title">Cover letter Doc</h2>
              </div>
              <button
                type="button"
                disabled={pending || syncingCoverLetter}
                onClick={() =>
                  runReset(
                    "cover",
                    "Clear the synced cover letter template?",
                  )
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface disabled:opacity-50"
                title="Reset cover letter"
              >
                <span className="material-symbols-outlined text-[16px]">
                  restart_alt
                </span>
                Reset
              </button>
            </div>
            <a
              href={COVER_LETTER_STRUCTURE_REF_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]">
                open_in_new
              </span>
              Cover letter structure reference
            </a>
            <div className="space-y-3">
              <span className="li-meta uppercase tracking-wide block">
                Import from
              </span>
              <div className="grid grid-cols-2 gap-2">
                <GoogleDocPickerButton
                  label={syncingCoverLetter ? "Syncing…" : "Drive"}
                  title="Choose cover letter (Doc, PDF or Word)"
                  className="w-full justify-center"
                  disabled={!googleConnected || syncingCoverLetter}
                  onPicked={(doc) => {
                    setError(null);
                    setMessage(null);
                    setCoverConvertedDocUrl(null);
                    const isDoc = doc.mimeType === GOOGLE_DOC_MIME;
                    setBusy(
                      isDoc
                        ? `Reading “${doc.name}”…`
                        : `Converting “${doc.name}” to a Google Doc…`,
                    );
                    startCoverLetterSync(async () => {
                      try {
                        const res = await syncCoverLetterFromDriveFile(
                          doc.id,
                          doc.mimeType,
                        );
                        if (!res.ok) {
                          setError(res.error);
                          setMessage(null);
                          return;
                        }
                        if (!isDoc) {
                          setCoverConvertedDocUrl(res.converted_doc_url);
                        }
                        applyCoverSyncSuccess(res, isDoc);
                      } catch (e) {
                        setMessage(null);
                        setError(
                          e instanceof Error ? e.message : "Sync failed",
                        );
                      } finally {
                        setBusy(null);
                      }
                    });
                  }}
                  onError={(msg) => setError(msg)}
                />
                <input
                  ref={coverLetterFileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Allow re-picking the same file after a failed attempt.
                    e.target.value = "";
                    if (!file) return;
                    setError(null);
                    setMessage(null);
                    setCoverConvertedDocUrl(null);
                    const sizeKb = Math.round(file.size / 1024);
                    setBusy(
                      `Uploading “${file.name}” (${sizeKb} KB) — converting to a Google Doc…`,
                    );
                    const form = new FormData();
                    form.set("cover_letter_file", file);
                    startCoverLetterSync(async () => {
                      try {
                        const res = await syncCoverLetterFromUpload(form);
                        if (!res.ok) {
                          setError(res.error);
                          setMessage(null);
                          return;
                        }
                        setCoverConvertedDocUrl(res.converted_doc_url);
                        applyCoverSyncSuccess(res, false);
                      } catch (e) {
                        setMessage(null);
                        setError(
                          e instanceof Error ? e.message : "Upload failed",
                        );
                      } finally {
                        setBusy(null);
                      }
                    });
                  }}
                />
                <button
                  type="button"
                  disabled={!googleConnected || syncingCoverLetter}
                  onClick={() => coverLetterFileInputRef.current?.click()}
                  title="Pick a cover letter from this device — PDF or Word, converted to a Google Doc automatically"
                  className="inline-flex w-full items-center justify-center gap-1.5 li-btn-secondary text-[13px] disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      syncingCoverLetter ? "animate-spin" : ""
                    }`}
                    aria-hidden
                  >
                    {syncingCoverLetter ? "progress_activity" : "devices"}
                  </span>
                  {syncingCoverLetter ? "Working…" : "This device"}
                </button>
              </div>
              {!googleConnected ? <ConnectGoogleHint /> : null}
              <div className="flex items-baseline justify-between gap-2 border-t border-outline-variant pt-2">
                <span className="li-meta uppercase tracking-wide">
                  Last sync
                </span>
                <span className="text-[13px] font-semibold text-on-surface">
                  {coverSyncedAt
                    ? formatAppDateTime(coverSyncedAt)
                    : "Never synced"}
                </span>
              </div>
            </div>
            {coverConvertedDocUrl ? (
              <a
                href={coverConvertedDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">
                  open_in_new
                </span>
                Open the converted Doc
              </a>
            ) : null}
          </div>
        </div>

        {/* Contact + links */}
        <div className="lg:col-span-4 li-card p-4 space-y-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Step 4
            </span>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">call</span>
              <h2 className="li-section-title">Contact & links</h2>
            </div>
          </div>
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
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  setLinkedinBlurError(null);
                }}
                onBlur={() => {
                  const value = linkedinUrl.trim();
                  if (!value) {
                    setLinkedinBlurError(null);
                    return;
                  }
                  setLinkedinBlurError(linkedinUrlError(value));
                }}
                placeholder="https://www.linkedin.com/in/..."
                aria-invalid={Boolean(linkedinBlurError)}
                required
              />
              {linkedinBlurError ? (
                <p className="mt-1 text-[12px] text-error" role="alert">
                  {linkedinBlurError}
                </p>
              ) : null}
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
          <Button
            type="button"
            onClick={saveContactOnly}
            disabled={pending || !contactDone}
            className="w-full"
          >
            {pending ? "Saving..." : "Save contact & links"}
          </Button>
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

      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm flex items-start gap-2 bg-surface-container-high text-on-surface border border-outline-variant px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm"
        >
          <span
            className="material-symbols-outlined animate-spin text-[18px] text-primary shrink-0"
            aria-hidden
          >
            progress_activity
          </span>
          <span>
            {busy}
            <span className="block text-[12px] text-on-surface-variant mt-0.5">
              This can take up to a minute — keep this tab open.
            </span>
          </span>
        </div>
      )}
      {!busy && message && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-success-container text-on-success-container border border-success/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm">
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

/**
 * Both import buttons need Google: Drive obviously, and a device upload
 * because the file is converted into a Google Doc before syncing. Say so, and
 * offer the fix inline — a disabled button with only prose next to it leaves
 * people clicking a dead control.
 */
function ConnectGoogleHint() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2">
      <span
        className="material-symbols-outlined text-[16px] text-on-surface-variant mt-px"
        aria-hidden
      >
        lock
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[12px] text-on-surface-variant">
          Connect Google to enable these — your file is stored as a Doc in your
          own Drive.
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/auth/google/start";
          }}
          className="li-btn-secondary text-[12px]"
        >
          Connect Google
        </button>
      </div>
    </div>
  );
}
