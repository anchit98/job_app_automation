"use client";

import { useTheme } from "@/components/theme/theme-provider";

export function ThemeToggle() {
  const { preference, resolved, cycle } = useTheme();

  const icon =
    preference === "system"
      ? "contrast"
      : resolved === "dark"
        ? "dark_mode"
        : "light_mode";

  const label =
    preference === "system"
      ? "Theme: System"
      : preference === "dark"
        ? "Theme: Dark"
        : "Theme: Light";

  return (
    <button
      type="button"
      onClick={cycle}
      className="ml-0.5 rounded-lg p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-[var(--ghost-hover)] transition-colors"
      title={`${label} (click to cycle)`}
      aria-label={label}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
