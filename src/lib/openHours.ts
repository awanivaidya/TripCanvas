// Checking an activity's time against its opening hours.
// Kept as plain functions (not tied to React) so both the edit dialog and the drag logic
// can reuse the same check.
import type { BoardActivity } from "@/lib/schemas";

// "09:30" -> 570 (minutes since midnight). Lets us compare times with plain math instead of
// string comparison, which breaks around midnight and is easy to get subtly wrong.
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// The hours fields. Optional, so the planner's draft cards (planTrip.ts) fit too.
type WithHours = Partial<Pick<BoardActivity, "openTime" | "closeTime">>;

// Does this activity have a real opening-hours constraint at all?
export function hasFixedHours(activity: WithHours): boolean {
  return Boolean(activity.openTime && activity.closeTime);
}

// Would `time` (and the activity's duration) fit inside its open/close hours?
// Returns null when it's fine, or a short message explaining why it isn't.
export function checkTimeAgainstHours(
  activity: WithHours & Pick<BoardActivity, "title" | "durationMin">,
  time: string | null,
): string | null {
  if (!time || !hasFixedHours(activity)) return null; // no constraint to check

  const open = toMinutes(activity.openTime!);
  const close = toMinutes(activity.closeTime!);
  const start = toMinutes(time);
  const end = start + activity.durationMin;

  if (start < open || start >= close) {
    return `${activity.title} is open ${activity.openTime}–${activity.closeTime}. ${time} is outside that.`;
  }
  if (end > close) {
    return `${activity.title} closes at ${activity.closeTime}, but this would run until ${minutesToTime(end)}.`;
  }
  return null;
}

// 570 -> "09:30"
export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
