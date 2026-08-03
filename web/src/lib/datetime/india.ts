/** App-wide timezone: India only. */
export const APP_TIMEZONE = "Asia/Kolkata";
export const APP_LOCALE = "en-IN";

/** Parse DB / API timestamps (UTC strings without zone → treat as UTC). */
export function parseAppTimestamp(value: string): Date {
  if (!value) return new Date(NaN);
  if (value.includes("T") || /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return new Date(value);
  }
  return new Date(`${value.trim().replace(" ", "T")}Z`);
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : parseAppTimestamp(value);
}

/** e.g. 3 Aug 2026, 4:05 pm */
export function formatAppDateTime(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return d.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  });
}

/** e.g. 3 Aug 2026 */
export function formatAppDate(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return d.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
}

/** e.g. 3 Aug (no year) */
export function formatAppDateShort(value: string | Date): string {
  return formatAppDate(value, { year: undefined });
}

/** Today's calendar date in India as YYYY-MM-DD (for date inputs). */
export function indiaTodayDateInput(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Start of an India calendar day → UTC ISO. */
export function indiaDayStartToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+05:30`).toISOString();
}

/** End of an India calendar day → UTC ISO. */
export function indiaDayEndToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();
}
