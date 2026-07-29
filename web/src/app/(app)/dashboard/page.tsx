import Link from "next/link";
import { getDashboardData } from "@/app/actions/tracker";
import { getProfile } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { getExtensionTokenStatus } from "@/app/actions/extension";
import { isGoogleConnected } from "@/lib/google/tokens";
import { env } from "@/lib/env";
import { SetupGuide } from "@/components/setup/setup-guide";
import { DashboardMetricsGrid } from "@/components/dashboard/dashboard-metrics";
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
    responseRate: "-",
    interviewRate: "-",
    offerRate: "-",
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
    <div className="dashboard-desktop-frame flex flex-col gap-3 lg:gap-4 overflow-y-auto max-md:min-h-0 max-md:pb-2">
      <section className="li-card p-4 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-center shrink-0">
        <div className="lg:col-span-7 flex items-start gap-3 min-w-0">
          <UserAvatar
            src={profileAvatarSrc(profile)}
            name={displayName}
            size={56}
            className="border-2"
          />
          <div className="min-w-0">
            <h1 className="li-page-title truncate text-[22px] lg:text-[24px]">
              {displayName}
            </h1>
            <p className="text-[14px] text-on-surface-variant mt-0.5 line-clamp-1 max-md:line-clamp-2">
              {headline}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:max-w-xs">
              <span className="text-on-surface-variant max-md:rounded-md max-md:bg-surface-container-low max-md:px-2.5 max-md:py-1.5">
                Applications{" "}
                <strong className="text-primary font-semibold">
                  {metrics.totalApplications}
                </strong>
              </span>
              <span className="text-on-surface-variant max-md:rounded-md max-md:bg-surface-container-low max-md:px-2.5 max-md:py-1.5">
                This week{" "}
                <strong className="text-on-surface font-semibold">
                  {metrics.applicationsThisWeek}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 shrink-0">
          <Link
            href="/apply"
            className="li-btn-primary shrink-0 no-underline justify-center max-sm:w-full"
          >
            <span className="material-symbols-outlined text-[18px]">
              rocket_launch
            </span>
            Start Quick Apply
          </Link>
          <Link
            href="/onboarding"
            className="group shrink-0 no-underline inline-flex items-stretch overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-[var(--shadow-card)] hover:border-outline/60 transition-colors max-sm:w-full"
          >
            <span
              className="flex items-center justify-center px-2.5 border-r border-border-hairline bg-surface-container-low text-on-surface-variant group-hover:bg-primary-container group-hover:text-primary transition-colors"
              aria-hidden
            >
              <span className="material-symbols-outlined text-[20px]">
                contact_page
              </span>
            </span>
            <span className="flex items-center gap-1 px-3 py-2 text-[13px] font-semibold text-on-surface">
              Update Profile
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                arrow_forward
              </span>
            </span>
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
            {metrics.pendingPrompts} AI step
            {metrics.pendingPrompts === 1 ? "" : "s"} pending
          </p>
          <p className="li-meta mt-1">
            JobApp Bridge handles these automatically - clear if leftover from
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
      </div>
    </div>
  );
}
