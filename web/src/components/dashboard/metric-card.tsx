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
      className={`rounded-lg border p-4 h-full flex flex-col gap-1.5 ${accentClass} ${href ? "hover:bg-[var(--ghost-hover)] transition-colors" : ""}`}
    >
      <span className="text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      <span className="text-[28px] font-semibold leading-8 text-on-surface">
        {value}
      </span>
      {hint && (
        <span className="text-[12px] text-on-surface-variant mt-auto line-clamp-2" title={hint}>
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
