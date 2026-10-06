// From "when is this person busy?" (Google Calendar's busy blocks) to "which stretches of days are
// completely free?". Plain functions with no Google or database code, so they're easy to test, and
// the browser can use the FreeStretch type and freeDaysFrom too.
import { addDays } from "@/lib/dates";

// A run of days with nothing in the calendar. Dates are "YYYY-MM-DD", both included.
export type FreeStretch = { start: string; end: string; days: number };

// A busy block as Google returns it: two moments in time ("2026-12-01T09:00:00Z").
export type BusyBlock = { start: string; end: string };

// The calendar date of a moment IN A TIME ZONE, as "YYYY-MM-DD". The same moment is one date in
// India and another in the US, and "a free day" means a day where the traveler lives. ("en-CA" is
// just a locale that happens to write dates as 2026-12-18.)
export function localDate(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

// The browser tells us its time zone ("Asia/Kolkata"). Never trust input: an unknown zone makes
// Intl throw, so fall back to UTC.
export function safeTimeZone(timeZone: string | null): string {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC" });
    return timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

// Every date that has something on it. A block from Friday 22:00 to Saturday 02:00 makes both days busy.
export function busyDates(blocks: BusyBlock[], timeZone: string): Set<string> {
  const busy = new Set<string>();
  for (const block of blocks) {
    const first = localDate(new Date(block.start), timeZone);
    // Minus 1 ms: a block ending exactly at midnight doesn't touch the next day.
    const last = localDate(new Date(new Date(block.end).getTime() - 1), timeZone);
    // "YYYY-MM-DD" strings sort like dates, so <= works.
    for (let date = first; date <= last; date = addDays(date, 1)) busy.add(date);
  }
  return busy;
}

// The free stretches between `from` and `to` (both included): the `limit` longest ones (the soonest
// first when equal), listed in date order. Single free days only count when there's nothing longer:
// a trip needs at least a weekend.
export function findFreeStretches(busy: Set<string>, from: string, to: string, limit = 6): FreeStretch[] {
  const stretches: FreeStretch[] = [];
  let start: string | null = null;
  let days = 0;
  // One day past `to`, treated as busy, closes a stretch that runs to the end.
  for (let date = from; date <= addDays(to, 1); date = addDays(date, 1)) {
    const free = date <= to && !busy.has(date);
    if (free) {
      start ??= date;
      days++;
    } else if (start) {
      stretches.push({ start, end: addDays(date, -1), days });
      start = null;
      days = 0;
    }
  }

  const longEnough = stretches.some((s) => s.days >= 2) ? stretches.filter((s) => s.days >= 2) : stretches;
  return longEnough
    .sort((a, b) => b.days - a.days || a.start.localeCompare(b.start))
    .slice(0, limit)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// Starting on `start`, how many days are free in a row? null if `start` isn't in a free stretch.
export function freeDaysFrom(stretches: FreeStretch[], start: string): number | null {
  const stretch = stretches.find((s) => s.start <= start && start <= s.end);
  if (!stretch) return null;
  return stretch.days - daysBetween(stretch.start, start);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}
