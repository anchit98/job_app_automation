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
    <div className="min-h-0 flex flex-col gap-3 lg:gap-4 overflow-y-auto pb-2 md:h-[calc(100vh-56px-2.75rem)] md:pb-0">
      <section className="li-card p-4 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start lg:items-center shrink-0">
        <div className="lg:col-span-7 flex items-center gap-3 min-w-0">
          <UserAvatar
            src={profileAvatarSrc(profile)}
            name={displayName}
            size={48}
            className="border-2"
          />
          <div className="min-w-0 flex-1">
            <h1 className="li-page-title truncate text-[20px] sm:text-[22px] lg:text-[24px]">
              {displayName}
            </h1>
            <p className="text-[13px] sm:text-[14px] text-on-surface-variant mt-0.5 line-clamp-2 sm:line-clamp-1">
              {headline}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] max-w-xs md:flex md:flex-wrap md:max-w-none md:gap-x-5 md:gap-y-1">
              <span className="rounded-md bg-surface-container-low px-2.5 py-1.5 text-on-surface-variant md:bg-transparent md:p-0">
                Applications{" "}
                <strong className="text-primary font-semibold">
                  {metrics.totalApplications}
                </strong>
              </span>
              <span className="rounded-md bg-surface-container-low px-2.5 py-1.5 text-on-surface-variant md:bg-transparent md:p-0">
                This week{" "}
                <strong className="text-on-surface font-semibold">
                  {metrics.applicationsThisWeek}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 mobile-stack md:flex md:flex-row md:items-stretch md:justify-end shrink-0">
          <Link
            href="/apply"
            className="li-btn-primary shrink-0 no-underline justify-center md:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">
              rocket_launch
            </span>
            Start Quick Apply
          </Link>
          <Link
            href="/onboarding"
            className="li-btn-secondary shrink-0 no-underline justify-center gap-2 md:w-auto"
          >
            <span className="material-symbols-outlined text-[18px]">
              contact_page
            </span>
            Update Profile
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
        <div className="li-card-flat p-3 border-l-4 border-l-status-waiting bg-status-waiting-container shrink-0">
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

      <div className="flex-1 min-h-0 flex flex-col gap-3 lg:gap-4">
        <section className="li-card p-4 lg:p-5 flex-1 min-h-0 flex flex-col">
          <DashboardMetricsGrid
            metrics={metrics}
            formatted={metricsFormatted}
          />
        </section>
        <EnqueueFollowUpsButton />
      </div>
    </div>
  );
}
