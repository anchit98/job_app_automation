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
      className={`rounded-lg border p-3 sm:p-4 h-full min-h-0 flex flex-col justify-center gap-1 ${accentClass} ${href ? "hover:bg-[var(--ghost-hover)] transition-colors" : ""}`}
    >
      <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      <span className="text-[24px] sm:text-[28px] lg:text-[32px] font-semibold leading-none text-on-surface">
        {value}
      </span>
      {hint && (
        <span className="text-[11px] sm:text-[12px] text-on-surface-variant line-clamp-2" title={hint}>
          {hint}
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
