// Small date helpers.
//
// Dates are a classic source of bugs: "2026-10-10" can become Oct 9 in some time zones.
// Rule used everywhere in this app: trip dates are stored as midnight *UTC*, and
// always formatted with timeZone "UTC", so every user sees the same calendar day.

// A 30-day plan is a long AI reply (~25,000 tokens). It works on Groq's free tier, but it uses up
// the per-minute limit, so the AI is busy for a few minutes afterwards (see LEARNING.md).
export const MAX_TRIP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-10" -> Date at 2026-10-10T00:00:00Z
export function parseDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

// Inclusive: Oct 10 -> Oct 14 is 5 days.
export function countTripDays(startDate: string, endDate: string): number {
  return Math.round((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / DAY_MS) + 1;
}

// "2026-10-10" plus 4 days -> "2026-10-14". Used to turn "start date + number of days" into an end date.
export function addDays(isoDate: string, days: number): string {
  return new Date(parseDate(isoDate).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Every date of the trip, in order.
export function listTripDates(startDate: string, endDate: string): Date[] {
  const start = parseDate(startDate);
  const count = countTripDays(startDate, endDate);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}

// Date -> "Sat, Oct 10"
export function formatDay(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
