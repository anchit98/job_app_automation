"use client";

import { useEffect, useState } from "react";

const stages = [
  { label: "JD parse", icon: "description" },
  { label: "Resume", icon: "article" },
  { label: "Cover letter", icon: "mail" },
  { label: "Gmail drafts", icon: "drafts" },
];

export function LandingAgentVisual() {
  // Cycles 0..stages.length: index === stages.length means "output ready"
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      setStep(stages.length);
      return;
    }
    const id = setInterval(() => {
      setStep((current) => (current + 1) % (stages.length + 2));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const outputReady = step >= stages.length;

  return (
    <div className="marketing-agent relative mx-auto w-full max-w-lg">
      <div className="marketing-agent-orbit" aria-hidden />
      <div className="marketing-agent-orbit marketing-agent-orbit-b" aria-hidden />
      <div className="mk-agent-card relative rounded-[28px] p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">
              Live agent loop
            </p>
            <p className="marketing-display mt-1 text-[19px] font-bold text-[var(--on-surface)]">
              Personalized for each role
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-container)] px-3 py-1.5 text-[11px] font-bold text-[var(--success)]">
            <span className="marketing-pulse-dot" />
            Active
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {stages.map((stage, index) => {
            const done = outputReady || index < step;
            const active = !outputReady && index === step;
            return (
              <div
                key={stage.label}
                className={`mk-agent-stage flex items-center gap-3.5 rounded-xl px-3.5 py-3 ${
                  active ? "is-active" : done ? "is-done" : ""
                }`}
              >
                <span className="mk-agent-stage-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <span className="material-symbols-outlined text-[21px]">
                    {stage.icon}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">{stage.label}</p>
                  <p className="text-[12px] text-[var(--on-surface-variant)]">
                    Customized from your master profile
                  </p>
                  {active ? <span className="mk-agent-progress" aria-hidden /> : null}
                </div>
                <span
                  className={`material-symbols-outlined text-[19px] transition-all duration-300 ${
                    done
                      ? "scale-100 text-[var(--success)] opacity-100"
                      : active
                        ? "mk-spin-slow scale-100 text-[var(--primary)] opacity-100"
                        : "scale-75 text-[var(--outline-variant)] opacity-60"
                  }`}
                >
                  {done ? "check_circle" : active ? "progress_activity" : "circle"}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className={`mk-agent-output mt-5 rounded-xl px-4 py-3.5 transition-all duration-500 ${
            outputReady ? "is-ready" : ""
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">
            Output
          </p>
          <p className="mt-1 text-[15px] font-bold leading-snug">
            Tracked package ready: resume, cover letter, drafts, follow-ups
          </p>
        </div>
      </div>
    </div>
  );
}
