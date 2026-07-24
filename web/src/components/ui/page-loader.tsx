import Image from "next/image";

export function PageLoader({
  label = "Loading ApplyForge…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const size = compact ? 44 : 56;
  const barWidth = compact ? "w-28" : "w-36";

  return (
    <div
      className="fixed inset-0 z-[45] flex flex-col items-center justify-center gap-4 bg-canvas px-6 af-loader-fade overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {!compact ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 50% 40%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 70%),
              radial-gradient(ellipse 40% 35% at 70% 70%, color-mix(in srgb, var(--primary-container) 55%, transparent), transparent 65%)
            `,
          }}
        />
      ) : null}
      <LoaderMark size={size} />
      <div className="relative text-center space-y-1">
        <p
          className={`font-semibold tracking-tight ${
            compact
              ? "text-[13px] text-on-surface-variant"
              : "text-[15px] text-on-surface"
          }`}
        >
          {label}
        </p>
        {!compact ? (
          <p className="li-meta">Preparing your workspace</p>
        ) : null}
      </div>
      <div
        className={`relative h-0.5 ${barWidth} rounded-full overflow-hidden bg-surface-container`}
      >
        <div className="h-full w-full af-loader-bar rounded-full opacity-90" />
      </div>
    </div>
  );
}

function LoaderMark({ size }: { size: number }) {
  const ring = size + 18;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: ring, height: ring }}
    >
      <span
        className="absolute rounded-full border-2 border-primary/25 af-loader-pulse"
        style={{ width: ring, height: ring }}
        aria-hidden
      />
      <span
        className="absolute rounded-full border-2 border-transparent border-t-primary border-r-primary/40 af-loader-orbit"
        style={{ width: ring - 4, height: ring - 4 }}
        aria-hidden
      />
      <Image
        src="/brand/logo.svg"
        alt=""
        width={size}
        height={size}
        className="relative rounded-[6px] shadow-[var(--shadow-card)]"
        priority
      />
    </div>
  );
}
