import Link from "next/link";
import { getDashboardData } from "@/app/actions/tracker";
import { getProfile } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { getExtensionTokenStatus } from "@/app/actions/extension";
import { isGoogleConnected } from "@/lib/google/tokens";
import { env } from "@/lib/env";
import { SetupGuide } from "@/components/setup/setup-guide";
import { DashboardMetricsGrid } from "@/components/dashboard/dashboard-metrics";
import { EnqueueFollowUpsButton } from "@/components/dashboard/enqueue-follow-ups-button";
import { ClearPendingPromptsButton } from "@/components/dashboard/clear-pending-prompts-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { profileAvatarSrc } from "@/lib/profile-avatar";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const googleError =
    typeof params.google_error === "string" ? params.google_error : null;

  const [
    dashboard,
    profile,
    resume,
    connected,
    extensionStatus,
  ] = await Promise.all([
    getDashboardData().catch(() => null),
    getProfile().catch(() => null),
    getMasterResume().catch(() => null),
    isGoogleConnected().catch(() => false),
    getExtensionTokenStatus().catch(() => ({
      configured: false,
      token_prefix: null,
      created_at: null,
    })),
  ]);

  const metrics = dashboard?.metrics ?? {
    totalApplications: 0,
    applicationsThisWeek: 0,
    responseRate: null,
    interviewRate: null,
    offerRate: null,
    pendingFollowUps: 0,
    snoozedFollowUps: 0,
    companiesContacted: 0,
    emailsSent: 0,
    pendingPrompts: 0,
    incompleteApplied: 0,
  };
  const metricsFormatted = dashboard?.metricsFormatted ?? {
    responseRate: "—",
    interviewRate: "—",
    offerRate: "—",
  };

  const profileDone = Boolean(
    profile?.full_name &&
      resume?.content &&
      Object.keys(resume.content).length > 0,
  );
  const appUrl = env.appUrl();
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`;

  const displayName = profile?.full_name || "Your profile";
  const headline = profile?.headline || "Job application command center";

  return (
    <div className="min-h-[calc(100vh-52px-2rem)] flex flex-col gap-4 lg:gap-5">
      <section className="li-card p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center">
        <div className="lg:col-span-7 flex items-start gap-4 min-w-0">
          <UserAvatar
            src={profileAvatarSrc(profile)}
            name={displayName}
            size={64}
            className="border-2"
          />
          <div className="min-w-0">
            <p className="li-meta">Home</p>
            <h1 className="li-page-title mt-0.5 truncate">{displayName}</h1>
            <p className="text-[15px] text-on-surface-variant mt-1 line-clamp-2">
              {headline}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <span className="text-on-surface-variant">
                Applications{" "}
                <strong className="text-primary font-semibold">
                  {metrics.totalApplications}
                </strong>
              </span>
              <span className="text-on-surface-variant">
                This week{" "}
                <strong className="text-on-surface font-semibold">
                  {metrics.applicationsThisWeek}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center gap-3 lg:justify-end">
          <div className="min-w-0 flex-1 xl:text-right">
            <h2 className="li-section-title">Quick Apply</h2>
            <p className="li-meta mt-1">
              Paste a JD + contacts — resume, cover letter, emails, and Gmail
              drafts run automatically.
            </p>
          </div>
          <Link
            href="/apply"
            className="li-btn-primary shrink-0 no-underline justify-center"
          >
            <span className="material-symbols-outlined text-[18px]">
              rocket_launch
            </span>
            Start Quick Apply
          </Link>
        </div>
      </section>

      <SetupGuide
        status={{
          consoleDone: Boolean(profile?.setup_console_done_at),
          googleConnected: connected,
          profileDone,
          extensionTokenConfigured: Boolean(extensionStatus.configured),
          guideCollapsed: Boolean(profile?.setup_guide_collapsed),
          googleError,
          appUrl,
          redirectUri,
        }}
      />

      {metrics.pendingPrompts > 0 && (
        <div className="li-card-flat p-4 border-l-4 border-l-status-waiting bg-status-waiting-container">
          <p className="text-[14px] font-semibold text-on-surface">
            {metrics.pendingPrompts} ChatGPT step
            {metrics.pendingPrompts === 1 ? "" : "s"} pending
          </p>
          <p className="li-meta mt-1">
            JobApp Bridge handles these automatically — clear if leftover from
            aborted runs.
          </p>
          <ClearPendingPromptsButton count={metrics.pendingPrompts} />
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
        <section className="lg:col-span-8 flex flex-col gap-4">
          <div className="li-card p-5 lg:p-6 flex-1">
            <DashboardMetricsGrid
              metrics={metrics}
              formatted={metricsFormatted}
            />
          </div>
          <EnqueueFollowUpsButton />
        </section>

        <aside className="lg:col-span-4 flex flex-col gap-4">
          <div className="li-card p-4 grid grid-cols-2 gap-3">
            <Link
              href="/apply"
              className="rounded-lg border border-border-hairline p-4 hover:bg-[var(--ghost-hover)] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                rocket_launch
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">
                Apply
              </p>
              <p className="li-meta mt-0.5">New pipeline</p>
            </Link>
            <Link
              href="/applications"
              className="rounded-lg border border-border-hairline p-4 hover:bg-[var(--ghost-hover)] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                work
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">
                Jobs
              </p>
              <p className="li-meta mt-0.5">All applications</p>
            </Link>
            <Link
              href="/onboarding"
              className="rounded-lg border border-border-hairline p-4 hover:bg-[var(--ghost-hover)] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                person
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">
                Profile
              </p>
              <p className="li-meta mt-0.5">Resume & docs</p>
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-border-hairline p-4 hover:bg-[var(--ghost-hover)] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                extension
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">
                Settings
              </p>
              <p className="li-meta mt-0.5">Bridge & health</p>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
