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
    id: "apply",
    label: "Quick Apply",
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
    caption: "Watch each AI stage complete in sequence",
  },
  {
    id: "bridge",
    label: "Bridge",
    icon: "extension",
    caption: "JobApp Bridge keeps AI connected to your agent",
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
    ["Pending follow-ups", "12"],
    ["Response rate", "0%"],
    ["Interview rate", "0%"],
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
          Start Quick Apply
        </span>
      </div>
      <p className="mb-2 text-[13px] font-bold">Pipeline metrics</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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

function ApplyPreview() {
  return (
    <Frame title="JobApp OS · Quick Apply">
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
          Paste the full job description. The agent will tailor your resume,
          cover letter, and outreach to this role.
        </div>
        <div
          className="mk-gallery-item rounded-lg bg-[var(--primary)] px-3.5 py-2.5 text-center text-[13px] font-semibold text-[var(--on-primary)]"
          style={{ animationDelay: "240ms" }}
        >
          Launch pipeline
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
        Bridge is handling AI stages automatically
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

function BridgePreview() {
  return (
    <Frame title="JobApp Bridge">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            tag: "App",
            title: "Prompt ready",
            body: "Composed from your master resume and the target JD",
          },
          {
            tag: "AI",
            title: "Reply captured",
            body: "Validated and written back into the pipeline",
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
        <span className="material-symbols-outlined mk-spin-slow text-[18px]">
          sync
        </span>
        Agent loop connected
      </div>
    </Frame>
  );
}

function Preview({ id }: { id: SlideId }) {
  switch (id) {
    case "dashboard":
      return <DashboardPreview />;
    case "apply":
      return <ApplyPreview />;
    case "jobs":
      return <JobsPreview />;
    case "pipeline":
      return <PipelinePreview />;
    case "bridge":
      return <BridgePreview />;
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
