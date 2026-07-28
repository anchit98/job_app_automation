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
      className={`rounded-lg border p-3 sm:p-4 h-full min-h-[118px] sm:min-h-[128px] grid grid-rows-[2.5rem_1fr_2rem] gap-1 ${accentClass} ${href ? "hover:bg-[var(--ghost-hover)] transition-colors" : ""}`}
    >
      <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant leading-tight line-clamp-2 self-start">
        {label}
      </span>
      <span className="text-[22px] sm:text-[28px] lg:text-[32px] font-semibold leading-none text-on-surface tabular-nums self-center">
        {value}
      </span>
      <span
        className="text-[11px] sm:text-[12px] text-on-surface-variant leading-tight line-clamp-2 self-end min-h-[2rem]"
        title={hint}
      >
        {hint || "\u00A0"}
      </span>
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
