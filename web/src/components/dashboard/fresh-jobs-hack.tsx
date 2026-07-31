const FRESH_JOBS_URL =
  "https://www.linkedin.com/jobs/search/?f_TPR=r3600&geoId=102713980&sortBy=DD&refresh=true";

const STEPS = [
  { icon: "open_in_new", label: "Open the filter" },
  { icon: "keyboard", label: "Type role & city" },
  { icon: "rocket_launch", label: "Apply first" },
];

export function FreshJobsBanner() {
  return (
    <section className="fjb-banner shrink-0" aria-label="Fresh jobs speed hack">
      <div className="fjb-blob fjb-blob-a" aria-hidden />
      <div className="fjb-blob fjb-blob-b" aria-hidden />

      <div className="relative flex flex-col lg:flex-row lg:items-center gap-4 px-4 lg:px-5 py-4 lg:py-5">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <span className="fjb-bolt shrink-0 mt-0.5 max-sm:hidden">
            <span className="material-symbols-outlined text-[22px]">bolt</span>
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] lg:text-[17px] font-bold leading-snug text-on-surface">
              Jobs posted in the{" "}
              <span className="text-primary">last hour</span> — be the first
              to apply
            </h2>
            <p className="mt-1 text-[13px] text-on-surface-variant max-w-[60ch]">
              Early applicants get shortlisted far more often. This LinkedIn
              filter shows only roles from the last 60 minutes.
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
              {STEPS.map((step, i) => (
                <span key={step.label} className="flex items-center gap-1.5">
                  <span className="fjb-chip">
                    <span className="material-symbols-outlined text-[14px]">
                      {step.icon}
                    </span>
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      className="material-symbols-outlined text-[13px] text-on-surface-variant/50"
                      aria-hidden
                    >
                      arrow_forward
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        <a
          href={FRESH_JOBS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fjb-cta shrink-0 max-lg:w-full"
        >
          <span className="material-symbols-outlined text-[18px]">
            schedule
          </span>
          Browse fresh jobs
          <span className="material-symbols-outlined fjb-cta-arrow text-[16px]">
            arrow_forward
          </span>
        </a>
      </div>
    </section>
  );
}
