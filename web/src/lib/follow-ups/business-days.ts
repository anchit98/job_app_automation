import { APP_TIMEZONE } from "@/lib/datetime/india";

const WEEKEND = new Set(["Sat", "Sun"]);

function formatWeekday(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isWeekend(date: Date, timeZone = APP_TIMEZONE): boolean {
  return WEEKEND.has(formatWeekday(date, timeZone));
}

/** Add N business days (Mon–Fri) in India (Asia/Kolkata) by default. */
export function addBusinessDays(
  start: Date,
  businessDays: number,
  timeZone = APP_TIMEZONE,
): Date {
  if (businessDays <= 0) return new Date(start.getTime());

  let current = new Date(start.getTime());
  let added = 0;

  while (added < businessDays) {
    current = addCalendarDays(current, 1);
    if (!isWeekend(current, timeZone)) {
      added++;
    }
  }

  return current;
}

/**
 * How long the app waits before nudging you to follow up, in calendar days.
 *
 * Calendar, not business, days: the rule the user asked for is "every 3 days",
 * and a reminder that quietly becomes five days because a weekend fell in the
 * middle is a reminder that arrived late.
 */
export const FOLLOW_UP_INTERVAL_DAYS = 3;

/** Add N calendar days. */
export function addDays(start: Date, days: number): Date {
  return addCalendarDays(start, days);
}

/** When the next follow-up nudge is due, counted from `from`. */
export function nextFollowUpDueAt(from: Date = new Date()): Date {
  return addCalendarDays(from, FOLLOW_UP_INTERVAL_DAYS);
}

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/**
 * Parse the timestamps the DB hands back.
 *
 * Postgres returns "2026-07-30 11:20:57.583459" with no zone marker for the
 * TEXT columns this schema uses; Date.parse reads that as local time, which is
 * hours off for a due date.
 */
export function parseDbTimestamp(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : new Date(ts);
}

export function parseUtcIso(iso: string): Date {
  return new Date(iso);
}
