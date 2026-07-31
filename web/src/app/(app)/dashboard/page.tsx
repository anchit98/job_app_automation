import Link from "next/link";
import { Suspense } from "react";
import { getDashboardData } from "@/app/actions/tracker";
import { getProfile } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { isGoogleConnected } from "@/lib/google/tokens";
import { env } from "@/lib/env";
import { parseMetricsRange } from "@/lib/tracker/metrics-range";
import { searchApplications } from "@/lib/tracker/queries";
import { SetupGuide } from "@/components/setup/setup-guide";
import { DashboardMetricsGrid } from "@/components/dashboard/dashboard-metrics";
import { RecentApplications } from "@/components/dashboard/recent-applications";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { FreshJobsBanner } from "@/components/dashboard/fresh-jobs-hack";
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
  const metricsRange = parseMetricsRange(params);

  const [dashboard, profile, resume, connected, recent] = await Promise.all([
    getDashboardData(metricsRange).catch(() => null),
    getProfile().catch(() => null),
    getMasterResume().catch(() => null),
    isGoogleConnected().catch(() => false),
    searchApplications({ page: 1, pageSize: 6 }).catch(() => null),
  ]);

  const metrics = dashboard?.metrics ?? {
    totalApplications: 0,
    applicationsThisWeek: 0,
    companiesContacted: 0,
    emailsSent: 0,
  };
  const pendingPrompts = dashboard?.pendingPrompts ?? 0;
  const recentItems = recent?.items ?? [];

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
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || null;
  const headline = profile?.headline || "Job application command center";

  return (
    <div className="dashboard-desktop-frame flex flex-col gap-3 lg:gap-4 overflow-y-auto max-md:min-h-0 max-md:pb-2">
      {/* Hero */}
      <section className="li-card overflow-hidden shrink-0">
        <div
          className="h-16 lg:h-20 bg-[linear-gradient(115deg,var(--primary-container)_0%,var(--surface-bright)_55%,var(--surface)_100%)]"
          aria-hidden
        />
        <div className="px-4 lg:px-6 pb-4 lg:pb-5">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="flex items-end gap-4 min-w-0 -mt-8 lg:-mt-10">
              <div className="rounded-full ring-4 ring-surface shrink-0 bg-surface">
                <UserAvatar
                  src={profileAvatarSrc(profile)}
                  name={displayName}
                  size={64}
                  className="border-2"
                />
              </div>
              <div className="min-w-0 pb-0.5">
                <p className="li-meta">
                  {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                </p>
                <h1 className="li-page-title truncate text-[22px] lg:text-[26px] leading-tight">
                  {displayName}
                </h1>
                <p className="text-[14px] text-on-surface-variant mt-0.5 line-clamp-1 max-md:line-clamp-2">
                  {headline}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <Link
                href="/apply"
                className="li-btn-primary shrink-0 no-underline justify-center max-sm:w-full"
              >
                <span className="material-symbols-outlined text-[18px]">
                  rocket_launch
                </span>
                Start Apply
              </Link>
              <Link
                href="/onboarding"
                className="group shrink-0 no-underline inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-hairline bg-surface px-4 py-2 text-[13px] font-semibold text-on-surface shadow-[var(--shadow-card)] hover:border-primary/40 hover:text-primary transition-colors max-sm:w-full"
              >
                <span className="material-symbols-outlined text-[18px]">
                  contact_page
                </span>
                Update Profile
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-surface-container-low px-3 py-1 text-[12px] text-on-surface-variant">
              <span
                className="material-symbols-outlined text-[15px] text-primary"
                aria-hidden
              >
                work
              </span>
              <strong className="font-semibold text-on-surface">
                {metrics.totalApplications}
              </strong>
              applications
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-surface-container-low px-3 py-1 text-[12px] text-on-surface-variant">
              <span
                className="material-symbols-outlined text-[15px] text-success"
                aria-hidden
              >
                trending_up
              </span>
              <strong className="font-semibold text-on-surface">
                {metrics.applicationsThisWeek}
              </strong>
              this week
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-hairline bg-surface-container-low px-3 py-1 text-[12px] text-on-surface-variant">
              <span
                className={`material-symbols-outlined text-[15px] ${connected ? "text-success" : "text-status-waiting"}`}
                aria-hidden
              >
                {connected ? "cloud_done" : "cloud_off"}
              </span>
              {connected ? "Google connected" : "Google not connected"}
            </span>
          </div>
        </div>
      </section>

      <FreshJobsBanner />

      <SetupGuide
        status={{
          consoleDone: Boolean(profile?.setup_console_done_at),
          googleConnected: connected,
          profileDone,
          guideCollapsed: Boolean(profile?.setup_guide_collapsed),
          googleError,
          appUrl,
          redirectUri,
        }}
      />

      {pendingPrompts > 0 && (
        <div className="li-card-flat p-3 border-l-4 border-l-status-waiting bg-status-waiting-container shrink-0">
          <p className="text-[14px] font-semibold text-on-surface">
            {pendingPrompts} AI step
            {pendingPrompts === 1 ? "" : "s"} pending
          </p>
          <p className="li-meta mt-1">
            Leftover from aborted runs — safe to clear if nothing is actively
            generating.
          </p>
          <ClearPendingPromptsButton count={pendingPrompts} />
        </div>
      )}

      <section className="li-card p-4 lg:p-5 shrink-0">
        <Suspense fallback={null}>
          <DashboardMetricsGrid metrics={metrics} range={metricsRange} />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 shrink-0 pb-1">
        <section className="li-card p-4 lg:p-5 lg:col-span-2">
          <RecentApplications items={recentItems} />
        </section>
        <section className="li-card p-4 lg:p-5">
          <QuickActions />
        </section>
      </div>
    </div>
  );
}
