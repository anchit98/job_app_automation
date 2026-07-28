interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: "primary" | "secondary" | "default";
}

export function MetricCard({
  label,
  value,
  hint,
  href,
  accent = "default",
}: MetricCardProps) {
  const accentClass =
    accent === "primary"
      ? "border-primary/30 bg-primary-container"
      : accent === "secondary"
        ? "border-border-hairline bg-surface-container-low"
        : "border-border-hairline bg-surface";

  const inner = (
    <div
      className={`rounded-lg border p-3 sm:p-4 h-full min-h-0 flex flex-col justify-center gap-1 max-md:min-h-[118px] max-md:grid max-md:grid-rows-[2.5rem_1fr_2rem] max-md:justify-normal ${accentClass} ${href ? "hover:bg-[var(--ghost-hover)] transition-colors" : ""}`}
    >
      <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant max-md:leading-tight max-md:line-clamp-2 max-md:self-start">
        {label}
      </span>
      <span className="text-[24px] sm:text-[28px] lg:text-[32px] font-semibold leading-none text-on-surface max-md:text-[22px] max-md:tabular-nums max-md:self-center">
        {value}
      </span>
      {hint ? (
        <span
          className="text-[11px] sm:text-[12px] text-on-surface-variant line-clamp-2 max-md:leading-tight max-md:self-end max-md:min-h-[2rem]"
          title={hint}
        >
          {hint}
        </span>
      ) : (
        <span
          className="hidden max-md:block text-[11px] leading-tight self-end min-h-[2rem]"
          aria-hidden
        >
          {"\u00A0"}
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block h-full no-underline">
        {inner}
      </a>
    );
  }

  return inner;
}
