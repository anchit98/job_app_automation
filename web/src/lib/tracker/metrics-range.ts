export type MetricsRangePreset = "7d" | "30d" | "90d" | "custom";

export interface MetricsRange {
  preset: MetricsRangePreset;
  fromIso: string;
  toIso: string;
  thisWeekFromIso: string;
  thisWeekToIso: string;
  /** YYYY-MM-DD for custom inputs; null for presets */
  fromDate: string | null;
  toDate: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfUtcDay(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function endOfUtcDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function intersectIso(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { from: string; to: string } | null {
  const from = aStart > bStart ? aStart : bStart;
  const to = aEnd < bEnd ? aEnd : bEnd;
  if (from > to) return null;
  return { from, to };
}

function presetRange(
  preset: Exclude<MetricsRangePreset, "custom">,
  now = new Date(),
): Pick<MetricsRange, "fromIso" | "toIso" | "fromDate" | "toDate"> {
  const toIso = now.toISOString();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const fromIso = daysAgoIso(days, now);
  return {
    fromIso,
    toIso,
    fromDate: null,
    toDate: null,
  };
}

function withThisWeek(
  base: Omit<MetricsRange, "thisWeekFromIso" | "thisWeekToIso">,
  now = new Date(),
): MetricsRange {
  const weekStart = daysAgoIso(7, now);
  const weekEnd = now.toISOString();
  const overlap = intersectIso(base.fromIso, base.toIso, weekStart, weekEnd);
  if (!overlap) {
    // Empty intersection: use inverted bounds so SQL COUNT returns 0
    return {
      ...base,
      thisWeekFromIso: base.toIso,
      thisWeekToIso: base.fromIso,
    };
  }
  return {
    ...base,
    thisWeekFromIso: overlap.from,
    thisWeekToIso: overlap.to,
  };
}

function parsePreset(raw: string | null | undefined): MetricsRangePreset | null {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "custom") {
    return raw;
  }
  return null;
}

/**
 * Parse dashboard metrics date filter from URL search params.
 * Default: last 30 days. Invalid custom dates fall back to 30d.
 */
export function parseMetricsRange(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
  now = new Date(),
): MetricsRange {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      return params.get(key) ?? undefined;
    }
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const preset = parsePreset(get("range")) ?? "30d";

  if (preset === "custom") {
    const fromDate = get("from")?.trim() ?? "";
    const toDate = get("to")?.trim() ?? "";
    if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate) || fromDate > toDate) {
      return withThisWeek(
        { preset: "30d", ...presetRange("30d", now) },
        now,
      );
    }
    return withThisWeek(
      {
        preset: "custom",
        fromIso: startOfUtcDay(fromDate),
        toIso: endOfUtcDay(toDate),
        fromDate,
        toDate,
      },
      now,
    );
  }

  return withThisWeek({ preset, ...presetRange(preset, now) }, now);
}

export function metricsRangeLabel(range: MetricsRange): string {
  switch (range.preset) {
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 3 months";
    case "custom":
      return `${range.fromDate ?? toDateInputValue(range.fromIso)} – ${range.toDate ?? toDateInputValue(range.toIso)}`;
  }
}
