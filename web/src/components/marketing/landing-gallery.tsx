"use client";

import { useEffect, useState } from "react";

const ROTATE_MS = 5200;

const slides = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    caption: "Command center with pipeline metrics and follow-ups",
  },
  {
    id: "google",
    label: "Google connect",
    icon: "account_circle",
    caption: "Connect Google once — Drive, Docs, and Gmail drafts, with your consent",
  },
  {
    id: "apply",
    label: "Apply",
    icon: "rocket_launch",
    caption: "Paste a JD and launch the full application agent run",
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: "work",
    caption: "Track every company, status, and outreach thread",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: "account_tree",
    caption: "Watch each AI stage complete automatically",
  },
  {
    id: "artifacts",
    label: "Artifacts",
    icon: "folder_open",
    caption: "Resume, cover letter, and drafts saved for each role",
  },
] as const;

type SlideId = (typeof slides)[number]["id"];

function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface)] shadow-[0_24px_60px_-32px_rgba(0,30,70,0.35)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-container-low)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--on-surface-variant)]">
          {title}
        </span>
      </div>
      <div className="bg-[var(--canvas)] p-4 sm:p-6">{children}</div>
    </div>
  );
}

function DashboardPreview() {
  const metrics = [
    ["Total applications", "7"],
    ["This week", "4"],
    ["Gmail drafts", "11"],
    ["Companies contacted", "7"],
  ];
  return (
    <Frame title="JobApp OS · Dashboard">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[16px] font-bold">Your profile</p>
          <p className="text-[12px] text-[var(--on-surface-variant)]">
            Applications customized for you
          </p>
        </div>
        <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--on-primary)]">
          Start Apply
        </span>
      </div>
      <p className="mb-2 text-[13px] font-bold">Pipeline metrics</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metrics.map(([label, value], index) => (
          <div
            key={label}
            className="mk-gallery-item rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] p-3"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
              {label}
            </p>
            <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function GoogleConnectPreview() {
  const scopes = [
    {
      icon: "folder_open",
      label: "Google Drive & Docs",
      detail: "Create and update your tailored resume and cover letter documents",
    },
    {
      icon: "drafts",
      label: "Gmail drafts",
      detail: "Save outreach and follow-up emails as drafts — never auto-sent",
    },
    {
      icon: "mark_email_read",
      label: "Reply tracking",
      detail: "Look up only the application threads created for you",
    },
  ];
  return (
    <Frame title="JobApp OS · Connect Google">
      <p className="text-[16px] font-bold">Connect your Google account</p>
      <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">
        JobApp OS requests these permissions, used only for your applications
      </p>
      <div className="mt-4 space-y-2.5">
        {scopes.map((scope, index) => (
          <div
            key={scope.label}
            className="mk-gallery-item flex items-start gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3.5 py-3"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--primary)]">
              {scope.icon}
            </span>
            <div>
              <p className="text-[13px] font-bold">{scope.label}</p>
              <p className="text-[12px] text-[var(--on-surface-variant)]">
                {scope.detail}
              </p>
            </div>
          </div>
        ))}
        <div
          className="mk-gallery-item rounded-lg bg-[var(--primary)] px-3.5 py-2.5 text-center text-[13px] font-semibold text-[var(--on-primary)]"
          style={{ animationDelay: "240ms" }}
        >
          Connect Google
        </div>
        <p
          className="mk-gallery-item text-center text-[11.5px] text-[var(--on-surface-variant)]"
          style={{ animationDelay: "300ms" }}
        >
          You can revoke access anytime from your Google Account settings.
        </p>
      </div>
    </Frame>
  );
}

function ApplyPreview() {
  return (
    <Frame title="JobApp OS · Apply">
      <p className="text-[16px] font-bold">New application</p>
      <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">
        Company, role, and job description required
      </p>
      <div className="mt-4 space-y-3">
        {[
          "Company: Northstar Labs",
          "Role: Product Manager",
        ].map((line, index) => (
          <div
            key={line}
            className="mk-gallery-item rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px]"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {line}
          </div>
        ))}
        <div
          className="mk-gallery-item min-h-28 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--on-surface-variant)]"
          style={{ animationDelay: "160ms" }}
        >
          Paste the full job description. AI tailors your resume, cover letter,
          and outreach automatically on the server.
        </div>
        <div
          className="mk-gallery-item rounded-lg bg-[var(--primary)] px-3.5 py-2.5 text-center text-[13px] font-semibold text-[var(--on-primary)]"
          style={{ animationDelay: "240ms" }}
        >
          Start Apply
        </div>
      </div>
    </Frame>
  );
}

function JobsPreview() {
  const rows = [
    ["Northstar Labs", "Product Manager", "Applied"],
    ["Orbit Finance", "Growth PM", "HR replied"],
    ["Canvas Health", "Platform PM", "Interview"],
  ];
  return (
    <Frame title="JobApp OS · Jobs">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[16px] font-bold">Applications</p>
        <span className="text-[12px] text-[var(--on-surface-variant)]">
          Search and filter
        </span>
      </div>
      <div className="space-y-2.5">
        {rows.map(([company, role, status], index) => (
          <div
            key={company}
            className="mk-gallery-item flex items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3.5 py-3"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div>
              <p className="text-[14px] font-bold">{company}</p>
              <p className="text-[12px] text-[var(--on-surface-variant)]">{role}</p>
            </div>
            <span className="rounded-full bg-[var(--primary-container)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary)]">
              {status}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function PipelinePreview() {
  const stages = [
    ["jd_parse", "Done"],
    ["resume", "Running"],
    ["cover_letter", "Queued"],
    ["cold_email", "Queued"],
    ["gmail_drafts", "Queued"],
  ];
  return (
    <Frame title="JobApp OS · Pipeline">
      <p className="text-[16px] font-bold">Live pipeline progress</p>
      <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">
        Server-side AI is running each stage automatically
      </p>
      <div className="mt-4 space-y-2.5">
        {stages.map(([name, state], index) => (
          <div
            key={name}
            className="mk-gallery-item flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3.5 py-2.5"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <span className="font-mono text-[12px]">{name}</span>
            <span
              className={`text-[12px] font-bold ${
                state === "Running"
                  ? "text-[var(--status-waiting)]"
                  : state === "Done"
                    ? "text-[var(--success)]"
                    : "text-[var(--on-surface-variant)]"
              }`}
            >
              {state}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ArtifactsPreview() {
  return (
    <Frame title="JobApp OS · Application package">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            tag: "Resume",
            title: "Tailored PDF ready",
            body: "Keyword-aligned to the JD, grounded in your master resume",
          },
          {
            tag: "Outreach",
            title: "Gmail drafts queued",
            body: "Cold emails saved as drafts — you send when ready",
          },
        ].map((card, index) => (
          <div
            key={card.tag}
            className="mk-gallery-item rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-4"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--on-surface-variant)]">
              {card.tag}
            </p>
            <p className="mt-2 text-[15px] font-bold">{card.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
              {card.body}
            </p>
          </div>
        ))}
      </div>
      <div
        className="mk-gallery-item mt-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-container)] px-4 py-3 text-[13px] font-bold text-[var(--primary)]"
        style={{ animationDelay: "200ms" }}
      >
        <span className="material-symbols-outlined text-[18px]">
          check_circle
        </span>
        Package ready to review
      </div>
    </Frame>
  );
}

function Preview({ id }: { id: SlideId }) {
  switch (id) {
    case "dashboard":
      return <DashboardPreview />;
    case "google":
      return <GoogleConnectPreview />;
    case "apply":
      return <ApplyPreview />;
    case "jobs":
      return <JobsPreview />;
    case "pipeline":
      return <PipelinePreview />;
    case "artifacts":
      return <ArtifactsPreview />;
  }
}

export function LandingGallery() {
  const [active, setActive] = useState<SlideId>("dashboard");
  const [paused, setPaused] = useState(false);
  const current = slides.find((slide) => slide.id === active) ?? slides[0];

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setActive((currentId) => {
        const index = slides.findIndex((slide) => slide.id === currentId);
        return slides[(index + 1) % slides.length].id;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-wrap justify-center gap-2.5">
        {slides.map((slide) => {
          const selected = slide.id === active;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => {
                setActive(slide.id);
                setPaused(true);
              }}
              className={`mk-gallery-tab inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold ${
                selected ? "is-active" : ""
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">
                {slide.icon}
              </span>
              {slide.label}
            </button>
          );
        })}
      </div>
      <p
        key={`caption-${active}`}
        className="mk-gallery-caption mx-auto mt-5 max-w-xl text-center text-[14px] text-[var(--on-surface-variant)]"
      >
        {current.caption}
      </p>
      <div
        key={active}
        className="marketing-gallery-frame mx-auto mt-6 max-w-3xl"
      >
        <Preview id={active} />
      </div>
    </div>
  );
}
