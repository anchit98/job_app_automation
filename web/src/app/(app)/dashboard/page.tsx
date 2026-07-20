import Link from "next/link";
import { getDashboardData } from "@/app/actions/tracker";
import { getProfile } from "@/app/actions/profile";
import { getMasterResume } from "@/app/actions/master-resume";
import { hasCompletedDemoPrompt } from "@/lib/db/queries";
import { isGoogleConnected } from "@/lib/google/tokens";
import { GoogleConnectPanel } from "@/components/google/google-connect-panel";
import { DashboardMetricsGrid } from "@/components/dashboard/dashboard-metrics";
import { EnqueueFollowUpsButton } from "@/components/dashboard/enqueue-follow-ups-button";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const googleError =
    typeof params.google_error === "string" ? params.google_error : null;
  const googleConnected = params.google_connected === "1";

  const [{ metrics, metricsFormatted }, profile, resume, connected, demoDone] =
    await Promise.all([
      getDashboardData(),
      getProfile().catch(() => null),
      getMasterResume().catch(() => null),
      isGoogleConnected().catch(() => false),
      Promise.resolve(hasCompletedDemoPrompt()),
    ]);

  const checklist = [
    { label: "Profile saved", done: Boolean(profile?.full_name) },
    {
      label: "Master resume synced",
      done: Boolean(resume?.content && Object.keys(resume.content).length > 0),
    },
    { label: "Google connected", done: connected },
    { label: "Demo completed", done: demoDone, href: "/demo" },
  ];

  const completedCount = checklist.filter((i) => i.done).length;
  const progressPercent = Math.round((completedCount / checklist.length) * 100);
  const setupComplete = completedCount === checklist.length;
  const displayName = profile?.full_name || "Your profile";
  const headline = profile?.headline || "Job application command center";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "A";

  return (
    <div className="min-h-[calc(100vh-52px-2rem)] flex flex-col gap-4 lg:gap-5">
      {/* Identity + CTA row */}
      <section className="li-card p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center">
        <div className="lg:col-span-7 flex items-start gap-4 min-w-0">
          <div className="h-16 w-16 shrink-0 rounded-full border-2 border-border-hairline bg-primary-container text-primary flex items-center justify-center text-[22px] font-semibold">
            {initials}
          </div>
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
              Paste a JD + contacts — resume, cover letter, emails, and Gmail drafts
              run automatically.
            </p>
          </div>
          <Link href="/apply" className="li-btn-primary shrink-0 no-underline justify-center">
            <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
            Start Quick Apply
          </Link>
        </div>
      </section>

      {metrics.pendingPrompts > 0 && (
        <Link
          href="/settings"
          className="li-card-flat block p-4 border-l-4 border-l-status-waiting bg-status-waiting-container no-underline"
        >
          <p className="text-[14px] font-semibold text-on-surface">
            {metrics.pendingPrompts} ChatGPT step
            {metrics.pendingPrompts === 1 ? "" : "s"} pending
          </p>
          <p className="li-meta mt-1">
            JobApp Bridge handles these automatically — check Settings if stuck.
          </p>
        </Link>
      )}

      {/* Main body: metrics + side utilities */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
        <section className="lg:col-span-8 flex flex-col gap-4">
          <div className="li-card p-5 lg:p-6 flex-1">
            <DashboardMetricsGrid metrics={metrics} formatted={metricsFormatted} />
          </div>
          <EnqueueFollowUpsButton />
        </section>

        <aside className="lg:col-span-4 flex flex-col gap-4">
          {!setupComplete && (
            <div className="li-card p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="li-section-title">Setup</h2>
                <span className="li-meta text-primary font-semibold">
                  {completedCount}/{checklist.length}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <ul className="space-y-3">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-[14px]">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        item.done ? "text-success" : "text-on-surface-variant"
                      }`}
                    >
                      {item.done ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    {item.href && !item.done ? (
                      <Link
                        href={item.href}
                        className="text-primary hover:underline font-semibold"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-on-surface-variant">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="li-card p-4 grid grid-cols-2 gap-3">
            <Link
              href="/apply"
              className="rounded-lg border border-border-hairline p-4 hover:bg-black/[0.02] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                rocket_launch
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">Apply</p>
              <p className="li-meta mt-0.5">New pipeline</p>
            </Link>
            <Link
              href="/applications"
              className="rounded-lg border border-border-hairline p-4 hover:bg-black/[0.02] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                work
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">Jobs</p>
              <p className="li-meta mt-0.5">All applications</p>
            </Link>
            <Link
              href="/onboarding"
              className="rounded-lg border border-border-hairline p-4 hover:bg-black/[0.02] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                person
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">Profile</p>
              <p className="li-meta mt-0.5">Resume & docs</p>
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-border-hairline p-4 hover:bg-black/[0.02] no-underline"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">
                extension
              </span>
              <p className="text-[14px] font-semibold mt-2 text-on-surface">Settings</p>
              <p className="li-meta mt-0.5">Bridge & health</p>
            </Link>
          </div>

          <div className="mt-auto">
            <GoogleConnectPanel
              initialConnected={connected}
              googleError={googleError}
              googleConnected={googleConnected}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
