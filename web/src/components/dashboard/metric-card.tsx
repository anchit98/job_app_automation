interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: string;
  tone?: "primary" | "success" | "tertiary" | "neutral";
  hint?: string;
  href?: string;
}

const TONE_CLASSES: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  primary: "bg-primary-container text-primary",
  success: "bg-success-container text-success",
  tertiary: "bg-tertiary-container text-tertiary",
  neutral: "bg-surface-container-low text-on-surface-variant",
};

export function MetricCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  href,
}: MetricCardProps) {
  const inner = (
    <div
      className={`group relative h-full rounded-xl border border-border-hairline bg-surface p-4 flex flex-col gap-3 transition-all duration-200 ${
        href
          ? "hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
          : "hover:shadow-[var(--shadow-card)]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
            aria-hidden
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </span>
        ) : null}
        <span className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant leading-tight">
          {label}
        </span>
      </div>
      <span className="text-[28px] sm:text-[32px] font-semibold leading-none text-on-surface tabular-nums">
        {value}
      </span>
      {hint ? (
        <span
          className="text-[11px] sm:text-[12px] text-on-surface-variant line-clamp-2"
          title={hint}
        >
          {hint}
        </span>
      ) : null}
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
