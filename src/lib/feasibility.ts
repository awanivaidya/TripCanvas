// Instant (no AI) checks for "does this change to the board still make sense time-wise?".
// Plain functions, like openHours.ts, so they're easy to read and test on their own.
//
// When a change doesn't work, these return a SHORT reason (findTimeProblem returns null when
// it's fine). The board shows that reason in a warning in the middle of the screen and doesn't save.
import type { BoardActivity, BoardDay } from "@/lib/schemas";
import { checkTimeAgainstHours, minutesToTime, toMinutes } from "@/lib/openHours";

const END_OF_DAY = 24 * 60; // minutes
// Be at the airport this long before a flight: whatever comes before it (sightseeing, lunch, the
// cab to the airport) must be over by then. Connecting flights are the exception.
// 3 hours for a long flight (usually international, with more checks), 2 for a short one: a
// fixed 3 hours had travelers in Europe leaving the hotel at 04:30 for a 1h30 flight at 08:00.
export const SHORT_FLIGHT_MAX_MIN = 3 * 60;
export function flightBufferMin(flight: { durationMin: number }): number {
  return flight.durationMin <= SHORT_FLIGHT_MAX_MIN ? 2 * 60 : 3 * 60;
}

// A flight card: a transport card that says so in its title ("Flight: CJU → ICN (Jeju Air)").
export function isFlight(activity: Pick<BoardActivity, "category" | "title">): boolean {
  return activity.category === "transport" && /\b(flight|fly|flying)\b/i.test(activity.title);
}

// The fields endMinutes needs. Optional, so the planner's draft cards (planTrip.ts) fit too.
type Timed = { startTime?: string | null; durationMin: number; arrivalTime?: string | null };

// When a card ends, on its day's clock (in minutes). Only for cards that have a startTime. Usually start + duration. A transport leg with
// an arrivalTime ends at that LOCAL time instead: a 9h30 flight leaving Delhi at 14:30 lands at
// 20:30 Paris time, not at 00:00. An arrival earlier than the start means the next day (a night
// train, or a flight east), so it counts as running past midnight.
export function endMinutes(activity: Timed): number {
  const start = toMinutes(activity.startTime!);
  if (!activity.arrivalTime) return start + activity.durationMin;
  const arrival = toMinutes(activity.arrivalTime);
  return arrival >= start ? arrival : arrival + END_OF_DAY;
}

// The card with a new start time. A leg's arrival moves by the same amount: a flight moved 2 hours
// later also lands 2 hours later.
export function withStartTime<T extends BoardActivity>(card: T, startTime: string | null): T {
  if (!card.arrivalTime || !card.startTime || !startTime) return { ...card, startTime };
  const shift = toMinutes(startTime) - toMinutes(card.startTime);
  // "+ END_OF_DAY, then % END_OF_DAY" wraps around midnight: 23:00 + 2h = 01:00, 01:00 - 2h = 23:00.
  const arrival = (toMinutes(card.arrivalTime) + shift + END_OF_DAY) % END_OF_DAY;
  return { ...card, startTime, arrivalTime: minutesToTime(arrival) };
}

// Is `activity` (at its current startTime) OK next to the other activities of its day?
// Checks: doesn't run past midnight, fits the place's opening hours, doesn't overlap another card.
// `flightBuffer: false` leaves out the airport rule (flightBufferMin). The board's always-on card warnings use
// that: the rule is only shown when a CHANGE breaks it (the blocking message), not as a permanent
// note on every flight day planned before the rule existed.
export function findTimeProblem(
  activity: BoardActivity,
  others: BoardActivity[],
  { flightBuffer = true }: { flightBuffer?: boolean } = {},
): string | null {
  if (!activity.startTime) return null; // no time set = nothing to clash with

  const start = toMinutes(activity.startTime);
  const end = endMinutes(activity);
  // A hotel stay or a night train/bus is expected to run past midnight. So is a night out (a club
  // opens around 23:00), as long as it's the day's last card.
  const isLastCard = !others.some((o) => o.id !== activity.id && o.startTime && toMinutes(o.startTime) > start);
  const overnightOk =
    activity.category === "lodging" || activity.category === "transport" || (activity.category === "activity" && isLastCard);
  if (end > END_OF_DAY && !overnightOk) {
    return `${activity.title} would run past midnight.`;
  }

  const hoursProblem = checkTimeAgainstHours(activity, activity.startTime);
  if (hoursProblem) return hoursProblem;

  for (const other of others) {
    if (other.id === activity.id || !other.startTime) continue;
    const otherStart = toMinutes(other.startTime);
    const otherEnd = endMinutes(other);
    // Two time ranges overlap when each one starts before the other one ends.
    if (start < otherEnd && otherStart < end) {
      return `Clashes with ${other.title} (${other.startTime}).`;
    }
  }
  return flightBuffer ? findFlightBufferProblem(activity, others) : null;
}

// The airport rule, both ways: a card must end 2-3 hours (flightBufferMin) before any later flight
// that day, and a flight needs every earlier card that day to have ended that long before it.
function findFlightBufferProblem(activity: BoardActivity, others: BoardActivity[]): string | null {
  const start = toMinutes(activity.startTime!);
  for (const other of others) {
    if (other.id === activity.id || !other.startTime) continue;
    const otherStart = toMinutes(other.startTime);
    // Which one is the flight, and which one comes before it?
    let before: BoardActivity | null = null;
    let flight: BoardActivity | null = null;
    if (isFlight(other) && otherStart >= start) [before, flight] = [activity, other];
    else if (isFlight(activity) && otherStart <= start) [before, flight] = [other, activity];
    // A connecting flight before a flight has its own, shorter, connection time.
    if (!before || !flight || isFlight(before)) continue;

    const buffer = flightBufferMin(flight);
    const latestEnd = toMinutes(flight.startTime!) - buffer;
    if (endMinutes(before) > latestEnd) {
      return `${before.title} ends at ${minutesToTime(endMinutes(before))}, but for ${flight.title} at ${flight.startTime} everything before it should be over by ${minutesToTime(Math.max(0, latestEnd))} (${buffer / 60} hours before take-off).`;
    }
  }
  return null;
}

// Cards with a time come first, earliest first. Cards without a time keep their order at the end.
// Used so every day always reads top-to-bottom in time order.
export function sortByTime(activities: BoardActivity[]): BoardActivity[] {
  const timed = activities.filter((a) => a.startTime);
  const untimed = activities.filter((a) => !a.startTime);
  timed.sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  return [...timed, ...untimed];
}

// When a card is dropped at position `index` of a day, what should its start time be?
// - If its current time already fits between the card above and the card below, keep it.
// - Otherwise it takes the time of the card it was dropped on top of (that card, and everything
//   after it, gets pushed later by settleDay below). At the very end of a day, it starts right
//   when the card above ends.
export function timeForDrop(activities: BoardActivity[], index: number): string | null {
  const card = activities[index];

  // The nearest cards above and below that actually have a time.
  const above = activities.slice(0, index).reverse().find((a) => a.startTime);
  const below = activities.slice(index + 1).find((a) => a.startTime);

  if (card.startTime) {
    const earliest = above ? endMinutes(above) : 0;
    const latest = below ? toMinutes(below.startTime!) : END_OF_DAY;
    const current = toMinutes(card.startTime);
    if (current >= earliest && endMinutes(card) <= latest) return card.startTime;
  }

  if (below) return below.startTime;
  if (above) return minutesToTime(endMinutes(above));
  return card.startTime; // alone in the day: nothing to line up with
}

// `pinned` has just been given a new time (dragged or edited). It keeps that time, and any card
// it now overlaps gets pushed later, like shuffling a queue: with a 2-hour card put in at 17:00,
// the card that was at 17:00 moves to 19:00, the one after that moves if it now clashes, and so on.
// Returns the day's new, time-sorted activities, or a problem if a pushed card no longer fits
// (runs past midnight or past its closing time).
export function settleDay(
  activities: BoardActivity[],
  pinned: BoardActivity,
): { activities: BoardActivity[] } | { problem: string } {
  const others = sortByTime(activities.filter((a) => a.id !== pinned.id));
  if (!pinned.startTime) return { activities: [...others, pinned] }; // no time: goes at the end

  const pinnedStart = toMinutes(pinned.startTime);
  const result: BoardActivity[] = [pinned];
  // `cursor` = the earliest time the next pushed card may start.
  let cursor = endMinutes(pinned);

  for (const card of others) {
    if (!card.startTime) {
      result.push(card);
      continue;
    }
    const start = toMinutes(card.startTime);
    const end = endMinutes(card);
    if (end <= pinnedStart) {
      result.push(card); // finishes before the pinned card starts: untouched
    } else {
      // Starts at/after the pinned card, or overlaps it: start it no earlier than `cursor`.
      const newStart = Math.max(start, cursor);
      const pushed = newStart === start ? card : withStartTime(card, minutesToTime(newStart));
      result.push(pushed);
      cursor = endMinutes(pushed);
    }
  }

  // Pushing can make a card run past midnight or past its closing time. Check the cards whose
  // time changed (untouched cards were already fine, so we don't re-judge them).
  const moved = result.filter((card) => card === pinned || !activities.includes(card));
  for (const card of moved) {
    const problem = findTimeProblem(card, result);
    if (!problem) continue;
    // For a pushed card, say what pushed it: otherwise "Hotel X would run past midnight" is a
    // confusing message about a card the user never touched.
    if (card === pinned) return { problem };
    return {
      problem: `${pinned.title} at ${pinned.startTime} pushes ${card.title} to ${card.startTime}. ${problem}`,
    };
  }
  return { activities: sortByTime(result) };
}

// The journey from home and back is numbered 1, 2, 3... (journeyStep). Reading the whole trip in
// order (day by day, top to bottom), those numbers must only go up: you can't take the flight
// (step 2) before the train that gets you to the airport (step 1).
// Returns null when the order is fine, or a message naming the two legs that are out of order.
export function findJourneyProblem(days: BoardDay[]): string | null {
  const legs = [...days]
    .sort((a, b) => a.index - b.index)
    .flatMap((day) => day.activities.filter((a) => a.journeyStep !== null));

  for (let i = 1; i < legs.length; i++) {
    const earlier = legs[i - 1];
    const later = legs[i];
    if (later.journeyStep! < earlier.journeyStep!) {
      return `That breaks your journey order: step ${later.journeyStep} (${later.title}) must come before step ${earlier.journeyStep} (${earlier.title}).`;
    }
  }
  return null;
}

// How far the clocks change on a transport leg, in minutes: -210 = clocks go back 3h 30m (flying
// west, e.g. Delhi → Paris), +240 = forward 4h. 0 when there's no change (or no arrival time).
// Worked out in code from what the card already has: the clock time between leaving and arriving,
// minus how long the journey really takes, is the time zone difference.
export function timeZoneShift(activity: Pick<BoardActivity, "startTime" | "durationMin" | "arrivalTime">): number {
  if (!activity.startTime || !activity.arrivalTime) return 0;
  let shift = endMinutes(activity) - toMinutes(activity.startTime) - activity.durationMin;
  // Time zones are between -12h and +14h of each other; an overnight leg can be a day off.
  while (shift > 14 * 60) shift -= END_OF_DAY;
  while (shift < -12 * 60) shift += END_OF_DAY;
  // Real time zones differ in steps of 15 minutes. The AI's durations are rounded, so a small gap
  // (a train "arriving" 10 minutes off) is just rounding, not a time zone.
  const rounded = Math.round(shift / 15) * 15;
  return Math.abs(rounded) >= 30 ? rounded : 0;
}

// Journey legs in the right order but sharing a number (a new leg got the same number as the one
// before it, so two cards showed "5"): number them all 1, 2, 3... again, in board order. The
// numbers only stand for the order, so this changes nothing else. Call it only when
// findJourneyProblem found no legs OUT of order (those are a real mistake to report instead).
export function renumberJourney(days: BoardDay[]): BoardDay[] {
  const legs = [...days]
    .sort((a, b) => a.index - b.index)
    .flatMap((day) => day.activities.filter((a) => a.journeyStep !== null));
  const steps = legs.map((a) => a.journeyStep!);
  if (new Set(steps).size === steps.length) return days; // no duplicates: leave everything as it is

  const newStep = new Map(legs.map((a, i) => [a.id, i + 1]));
  return days.map((day) => ({
    ...day,
    activities: day.activities.map((a) => (newStep.has(a.id) ? { ...a, journeyStep: newStep.get(a.id)! } : a)),
  }));
}
