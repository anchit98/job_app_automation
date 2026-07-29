"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { GoogleConnectPanel } from "@/components/google/google-connect-panel";
import { ExtensionBridgeControls } from "@/components/settings/extension-bridge-controls";
import {
  clearSetupConsoleDone,
  markSetupConsoleDone,
  setSetupGuideCollapsed,
} from "@/app/actions/setup";

export type SetupGuideStatus = {
  consoleDone: boolean;
  googleConnected: boolean;
  profileDone: boolean;
  extensionTokenConfigured: boolean;
  guideCollapsed: boolean;
  googleError?: string | null;
  appUrl: string;
  redirectUri: string;
};

type StepId = "console" | "google" | "profile" | "extension";

const STEPS: { id: StepId; title: string }[] = [
  { id: "console", title: "Google Cloud Console" },
  { id: "google", title: "Connect Google account" },
  { id: "profile", title: "Profile & master docs" },
  { id: "extension", title: "Install JobApp Bridge" },
];

export function SetupGuide({ status }: { status: SetupGuideStatus }) {
  const [pending, startTransition] = useTransition();
  const [consoleDone, setConsoleDone] = useState(status.consoleDone);
  const [minimized, setMinimized] = useState(status.guideCollapsed);
  /** Floating checklist panel vs tiny chatbot-style pill */
  const [panelOpen, setPanelOpen] = useState(false);
  const [extensionLive, setExtensionLive] = useState({
    tokenConfigured: status.extensionTokenConfigured,
    bridgeOk: null as boolean | null,
  });

  const stepsDone = useMemo(
    () => ({
      console: consoleDone,
      google: status.googleConnected,
      profile: status.profileDone,
      extension:
        extensionLive.tokenConfigured || status.extensionTokenConfigured,
    }),
    [
      consoleDone,
      status.googleConnected,
      status.profileDone,
      extensionLive.tokenConfigured,
      status.extensionTokenConfigured,
    ],
  );

  const completedCount = STEPS.filter((s) => stepsDone[s.id]).length;
  const allDone = completedCount === STEPS.length;
  const progressPercent = Math.round((completedCount / STEPS.length) * 100);

  const firstIncomplete = STEPS.find((s) => !stepsDone[s.id])?.id ?? STEPS[0].id;
  const [openStep, setOpenStep] = useState<StepId | null>(firstIncomplete);

  function persistMinimized(next: boolean) {
    // Optimistic UI - persist in the background so Minimize feels instant.
    setMinimized(next);
    if (next) setPanelOpen(false);
    void setSetupGuideCollapsed(next).catch(() => {
      setMinimized(!next);
    });
  }

  function expandToStep(stepId: StepId) {
    setOpenStep(stepId);
    if (minimized) {
      setPanelOpen(false);
      persistMinimized(false);
    }
  }

  function toggleStep(stepId: StepId) {
    setOpenStep((s) => (s === stepId ? null : stepId));
  }

  const stepList = (
    <ul className="space-y-0.5">
      {STEPS.map((step) => {
        const done = stepsDone[step.id];
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => expandToStep(step.id)}
              className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[var(--ghost-hover)] transition-colors"
            >
              <span
                className={`material-symbols-outlined text-[18px] shrink-0 ${
                  done ? "text-success" : "text-on-surface-variant"
                }`}
              >
                {done ? "check_circle" : "radio_button_unchecked"}
              </span>
              <span
                className={`text-[12px] leading-snug truncate ${
                  done
                    ? "text-on-surface-variant"
                    : "text-on-surface font-medium"
                }`}
              >
                {step.title}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {panelOpen ? (
          <div
            className="w-[min(100vw-2rem,17.5rem)] rounded-2xl border border-border-hairline bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.14)] p-3 space-y-2.5"
            role="dialog"
            aria-label="Setup progress"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`material-symbols-outlined text-[20px] shrink-0 ${
                    allDone ? "text-success" : "text-primary"
                  }`}
                >
                  {allDone ? "check_circle" : "checklist"}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-on-surface leading-tight">
                    Setup
                  </p>
                  <p className="text-[11px] text-on-surface-variant leading-tight">
                    {completedCount}/{STEPS.length}
                    {allDone ? " · Done" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface transition-colors"
                  onClick={() => persistMinimized(false)}
                  aria-label="Open full setup guide"
                  title="Open full guide"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    open_in_full
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-[var(--ghost-hover)] hover:text-on-surface transition-colors"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Minimize setup"
                  title="Minimize"
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
            {stepList}
          </div>
        ) : null}

        {/* Chatbot-style closed pill */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border-hairline bg-surface pl-2.5 pr-3.5 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.16)] hover:bg-surface-container-low transition-colors"
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Close setup checklist" : "Open setup checklist"}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              allDone
                ? "bg-success-container text-success"
                : "bg-primary-container text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {allDone ? "check" : "checklist"}
            </span>
          </span>
          <span className="text-[13px] font-semibold text-on-surface">
            Setup
          </span>
          <span className="text-[12px] font-semibold text-primary tabular-nums">
            {completedCount}/{STEPS.length}
          </span>
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            {panelOpen ? "keyboard_arrow_down" : "keyboard_arrow_up"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="li-card p-5 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="li-section-title">Setup guide</h2>
          <p className="li-meta mt-1 max-w-xl">
            Connect Google Cloud OAuth, link your account, finish your profile,
            and install JobApp Bridge so Quick Apply can run end-to-end.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="li-meta text-primary font-semibold">
            {completedCount}/{STEPS.length}
          </span>
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

      <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="space-y-2">
        <StepHeader
          index={1}
          title="Google Cloud Console"
          done={stepsDone.console}
          open={openStep === "console"}
          onToggle={() => toggleStep("console")}
        />
        {openStep === "console" && (
          <StepBody>
            <p className="text-[13px] text-on-surface-variant">
              Create an OAuth client once for this deployment (self-host / first
              setup). The app uses these env credentials; each user then Connects
              their own Google account in the next step.
            </p>
            <ol className="list-decimal pl-5 text-[13px] text-on-surface-variant space-y-2 mt-3">
              <li>
                Open{" "}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary font-semibold hover:underline"
                >
                  Google Cloud Console
                </a>{" "}
                → create or select a project.
              </li>
              <li>
                Enable <strong>Gmail API</strong>, <strong>Google Drive API</strong>
                , and <strong>Google Docs API</strong>.
              </li>
              <li>
                Configure the <strong>OAuth consent screen</strong> (External).
                Add scopes:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>
                    <code className="text-[11px]">
                      https://www.googleapis.com/auth/gmail.compose
                    </code>
                  </li>
                  <li>
                    <code className="text-[11px]">
                      https://www.googleapis.com/auth/gmail.send
                    </code>
                  </li>
                  <li>
                    <code className="text-[11px]">
                      https://www.googleapis.com/auth/drive.readonly
                    </code>
                  </li>
                  <li>
                    <code className="text-[11px]">
                      https://www.googleapis.com/auth/drive.file
                    </code>
                  </li>
                  <li>
                    <code className="text-[11px]">
                      https://www.googleapis.com/auth/documents
                    </code>
                  </li>
                </ul>
              </li>
              <li>
                Add your Google account as a <strong>Test user</strong> while the
                app is in testing.
              </li>
              <li>
                <strong>Credentials</strong> → Create <strong>OAuth client ID</strong>{" "}
                → Web application.
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>
                    Authorized JavaScript origins:{" "}
                    <code className="text-[11px]">{status.appUrl}</code>
                  </li>
                  <li>
                    Authorized redirect URI:{" "}
                    <code className="text-[11px]">{status.redirectUri}</code>
                  </li>
                </ul>
              </li>
              <li>
                Put Client ID and Secret in the deployment env as{" "}
                <code className="text-[11px]">GOOGLE_OAUTH_CLIENT_ID</code> /{" "}
                <code className="text-[11px]">GOOGLE_OAUTH_CLIENT_SECRET</code>,
                plus{" "}
                <code className="text-[11px]">GOOGLE_OAUTH_REDIRECT_URI</code>{" "}
                matching the redirect above, and{" "}
                <code className="text-[11px]">GOOGLE_TOKEN_ENCRYPTION_KEY</code>.
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              {!consoleDone ? (
                <button
                  type="button"
                  disabled={pending}
                  className="li-btn-primary text-[13px] disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      await markSetupConsoleDone();
                      setConsoleDone(true);
                      setOpenStep("google");
                    })
                  }
                >
                  I&apos;ve created the OAuth client / env is configured
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  className="li-btn-ghost text-[13px] disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      await clearSetupConsoleDone();
                      setConsoleDone(false);
                    })
                  }
                >
                  Undo mark done
                </button>
              )}
              <button
                type="button"
                className="li-btn-secondary text-[13px]"
                onClick={() => setOpenStep("google")}
              >
                Next: Connect Google
              </button>
            </div>
          </StepBody>
        )}

        <StepHeader
          index={2}
          title="Connect Google account"
          done={stepsDone.google}
          open={openStep === "google"}
          onToggle={() => toggleStep("google")}
        />
        {openStep === "google" && (
          <StepBody>
            <p className="text-[13px] text-on-surface-variant mb-3">
              Sign in with the Google account that should own Drive docs and
              Gmail drafts. Permissions: compose drafts, read/create Drive files,
              and edit Docs used for master resume / cover letter.
            </p>
            <GoogleConnectPanel
              embedded
              initialConnected={status.googleConnected}
              googleError={status.googleError}
            />
            <button
              type="button"
              className="li-btn-secondary text-[13px] mt-3"
              onClick={() => setOpenStep("profile")}
            >
              Next: Profile &amp; docs
            </button>
          </StepBody>
        )}

        <StepHeader
          index={3}
          title="Profile & master docs"
          done={stepsDone.profile}
          open={openStep === "profile"}
          onToggle={() => toggleStep("profile")}
        />
        {openStep === "profile" && (
          <StepBody>
            <p className="text-[13px] text-on-surface-variant">
              Save your name and headline, paste or sync your master resume, and
              link the Google Docs used as templates. Pipelines need a synced
              master resume before they can tailor applications.
            </p>
            <ul className="mt-3 text-[13px] text-on-surface-variant space-y-1.5 list-disc pl-5">
              <li>Full name (required)</li>
              <li>Master resume JSON and/or Google Doc sync</li>
              <li>Optional cover letter master Doc</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/onboarding"
                className="li-btn-primary text-[13px] no-underline"
              >
                Open Profile
              </Link>
              <button
                type="button"
                className="li-btn-secondary text-[13px]"
                onClick={() => setOpenStep("extension")}
              >
                Next: Extension
              </button>
            </div>
          </StepBody>
        )}

        <StepHeader
          index={4}
          title="Install JobApp Bridge"
          done={stepsDone.extension}
          open={openStep === "extension"}
          onToggle={() => toggleStep("extension")}
        />
        {openStep === "extension" && (
          <StepBody>
            <p className="text-[13px] text-on-surface-variant mb-3">
              The Chrome extension opens your AI chat, pastes prompts, and posts
              replies back. Download it for your machine, load unpacked, then
              paste the token.
            </p>
            <ExtensionBridgeControls
              showInstallGuide
              onStatusChange={setExtensionLive}
            />
            <p className="li-meta mt-3">
              After saving Options, reload this tab. Manage tokens anytime under{" "}
              <Link
                href="/settings"
                className="text-primary font-semibold hover:underline"
              >
                Privacy &amp; Settings
              </Link>
              .
            </p>
          </StepBody>
        )}
      </div>
    </div>
  );
}

function StepHeader({
  index,
  title,
  done,
  open,
  onToggle,
}: {
  index: number;
  title: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        open
          ? "border-primary/40 bg-primary-container/40"
          : "border-border-hairline bg-surface hover:bg-[var(--ghost-hover)]"
      }`}
    >
      <span
        className={`material-symbols-outlined text-[22px] ${
          done ? "text-success" : "text-on-surface-variant"
        }`}
      >
        {done ? "check_circle" : "radio_button_unchecked"}
      </span>
      <span className="text-[13px] font-semibold text-on-surface-variant w-5">
        {index}
      </span>
      <span className="text-[14px] font-semibold text-on-surface flex-1">
        {title}
      </span>
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
        {open ? "expand_less" : "expand_more"}
      </span>
    </button>
  );
}

function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-hairline border-t-0 -mt-2 mb-2 px-4 py-4 bg-surface">
      {children}
    </div>
  );
}
