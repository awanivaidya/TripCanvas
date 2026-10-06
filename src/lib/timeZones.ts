// Local arrival times across time zones, worked out in code.
//
// The AI used to write each leg's arrivalTime itself, and the clock arithmetic was often wrong:
// "Paris → Barcelona: clocks go forward 1h" (same time zone), "Istanbul → Delhi: back 1h" (India
// is 2h30 AHEAD). Now the AI only NAMES the time zones ("Europe/Paris", "Asia/Kolkata"), which it
// knows well, and this file does the sums. JavaScript's built-in Intl knows every zone's offset
// on any date, including summer time, so there's nothing to install.
import { minutesToTime, toMinutes } from "@/lib/openHours";

// Minutes ahead of UTC in `timeZone` on `date`: "Asia/Kolkata" -> 330, "Europe/London" -> 0 or 60
// (summer time). null for a name Intl doesn't know (the AI made one up).
export function utcOffsetMinutes(timeZone: string, date: Date): number | null {
  try {
    // "longOffset" formats the zone as "GMT+05:30" (or just "GMT" when it's UTC itself).
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    if (name === "GMT") return 0;
    const match = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "-" ? -minutes : minutes;
  } catch {
    return null; // Intl throws a RangeError for an unknown time zone
  }
}

// A leg leaving at `startTime` (local time where it leaves), taking `durationMin`: the local time
// where it arrives. E.g. 09:00 from Delhi (+5:30), 6h30 to Istanbul (+3:00) -> 13:00.
// An arrival after midnight wraps ("01:30"), which the rest of the app reads as the next day.
// null when a zone is unknown, or the sum would land before the leg left (we'd rather keep the
// AI's own arrivalTime than invent one).
export function arrivalTimeFor(
  leg: { startTime: string; durationMin: number; fromTimeZone: string; toTimeZone: string },
  date: Date,
): string | null {
  const from = utcOffsetMinutes(leg.fromTimeZone, date);
  const to = utcOffsetMinutes(leg.toTimeZone, date);
  if (from === null || to === null) return null;
  const arrival = toMinutes(leg.startTime) + leg.durationMin + (to - from);
  if (arrival < 0) return null;
  return minutesToTime(arrival % (24 * 60));
}
