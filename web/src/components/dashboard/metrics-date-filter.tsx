"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MetricsRange, MetricsRangePreset } from "@/lib/tracker/metrics-range";
import { indiaTodayDateInput } from "@/lib/datetime/india";

const PRESETS: { id: MetricsRangePreset; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 3 months" },
  { id: "custom", label: "Custom" },
];

interface MetricsDateFilterProps {
  range: MetricsRange;
}

export function MetricsDateFilter({ range }: MetricsDateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const pushParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `/dashboard?${qs}` : "/dashboard");
      });
    },
    [router, searchParams],
  );

  function onPresetChange(preset: MetricsRangePreset) {
    if (preset === "custom") {
      const today = indiaTodayDateInput();
      const from =
        range.fromDate ??
        indiaTodayDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const to = range.toDate ?? today;
      pushParams({ range: "custom", from, to });
      return;
    }
    pushParams({ range: preset, from: null, to: null });
  }

  function onCustomDateChange(wh: "from" | "to", value: string) {
    const from = wh === "from" ? value : (range.fromDate ?? value);
    const to = wh === "to" ? value : (range.toDate ?? value);
    if (!from || !to) return;
    pushParams({ range: "custom", from, to });
  }

  const controlClass =
    "rounded-lg border border-border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 justify-end ${pending ? "opacity-70" : ""}`}
    >
      <label className="sr-only" htmlFor="metrics-range">
        Date range
      </label>
      <select
        id="metrics-range"
        className={`${controlClass} max-w-[11rem]`}
        value={range.preset}
        onChange={(e) => onPresetChange(e.target.value as MetricsRangePreset)}
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {range.preset === "custom" && (
        <>
          <input
            type="date"
            aria-label="From date"
            className={controlClass}
            value={range.fromDate ?? ""}
            max={range.toDate ?? undefined}
            onChange={(e) => onCustomDateChange("from", e.target.value)}
          />
          <span className="text-[12px] text-on-surface-variant">to</span>
          <input
            type="date"
            aria-label="To date"
            className={controlClass}
            value={range.toDate ?? ""}
            min={range.fromDate ?? undefined}
            onChange={(e) => onCustomDateChange("to", e.target.value)}
          />
        </>
      )}
    </div>
  );
}
