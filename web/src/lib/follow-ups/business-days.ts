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

export function toUtcIso(date: Date): string {
  return date.toISOString();
}

export function parseUtcIso(iso: string): Date {
  return new Date(iso);
}
