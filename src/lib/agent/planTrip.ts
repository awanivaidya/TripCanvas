// The trip-planning agent.
//
// How it works:
//   1. We send the AI a system prompt (its instructions) and the user's trip request.
//   2. We give it ONE tool, create_itinerary, and *force* it to call that tool.
//      "Tool calling" = the AI replies with structured JSON arguments for a function
//      we described, instead of free text. That's how we get data we can save.
//   3. We check the JSON with Zod. If it's wrong (a missing field, the wrong number of days),
//      we ask again, with a note saying what was wrong.
//
// Long trips (more than 10 days) are planned in PARTS: one reply for 30 days is ~27,000 tokens,
// and the AI tends to stop early (it wrote 24 of 30 days). So it first outlines the whole trip in
// one line per day (outline_trip), then plans up to 10 days at a time, each part following the
// outline and carrying on from where the previous part ended.
import { z } from "zod";
import { createCompletion, SMART_MODEL } from "@/lib/agent/llm";
import { FIX_DAY_SYSTEM_PROMPT, OUTLINE_SYSTEM_PROMPT, PLANNER_SYSTEM_PROMPT, buildPlannerRequest } from "@/lib/agent/prompts";
import {
  DayFixSchema,
  ItineraryDraftSchema,
  TripOutlineSchema,
  type ItineraryDraft,
  type TripInput,
  type TripOutline,
} from "@/lib/schemas";
import { formatDay, listTripDates } from "@/lib/dates";
import { checkTimeAgainstHours, minutesToTime, toMinutes } from "@/lib/openHours";
import { endMinutes, flightBufferMin, isFlight } from "@/lib/feasibility";
import { arrivalTimeFor } from "@/lib/timeZones";

// 3 tries for a broken reply (other agents use 2): a failure here costs the user the whole trip,
// so one extra try is worth it. Timing problems don't use these: they're fixed day by day.
const MAX_ATTEMPTS = 3;
// The most days planned in one AI reply. 10 is the longest we've seen work reliably in one go.
const MAX_DAYS_PER_PART = 10;
// Whole plans to try before giving up. Most problems are fixed one day at a time (fixBrokenDays),
// so a second whole plan is rarely needed.
const MAX_PLANS = 2;
const END_OF_DAY = 24 * 60; // minutes
const LEAVE_AIRPORT_MIN = 30; // after landing: walk, passport control, bags

type Day = ItineraryDraft["days"][number];
type DraftActivity = Day["activities"][number];

// `origin` = the traveler's current town (e.g. "Dhing, Assam, IN"), so day 1 and the last day can
// include the real journey there and back. null when we couldn't detect it.
// `currencyCode` = their home currency (e.g. "INR"), used for the estimated costs.
export async function planTrip(
  input: TripInput,
  origin: string | null,
  currencyCode: string,
): Promise<ItineraryDraft> {
  const dates = listTripDates(input.startDate, input.endDate);
  const request = buildPlannerRequest(input, dates, origin, currencyCode);

  if (dates.length <= MAX_DAYS_PER_PART) return planDays(request, dates, 0, input.destination);

  // A long trip: the outline first, then the parts. Split evenly: 30 days = 3 parts of 10,
  // 11 days = 6 + 5 (not 10 + 1).
  const outline = await outlineTrip(request, dates);
  const partSize = Math.ceil(dates.length / Math.ceil(dates.length / MAX_DAYS_PER_PART));
  const days: ItineraryDraft["days"] = [];
  for (let from = 0; from < dates.length; from += partSize) {
    const to = Math.min(from + partSize, dates.length);
    const lastStep = lastJourneyStep(days);
    console.log(`planTrip: planning days ${from + 1}-${to} of ${dates.length}`);
    const partRequest = `${request}\n\n${describePart(outline, dates, from, to, days, lastStep)}`;
    const part = await planDays(partRequest, dates.slice(from, to), lastStep, input.destination);
    days.push(...part.days);
  }
  return { title: outline.title, destination: outline.destination, days };
}

// Plan these dates: one create_itinerary call (with retries for broken replies), then repair any
// day that breaks a timing rule ON ITS OWN (fixBrokenDays). A broken day used to mean asking for
// the whole trip again (~15,000 tokens); fixing just that day costs ~4,000.
// `stepsBefore` = the last journey step used by earlier parts, so this part's legs come after it.
async function planDays(request: string, dates: Date[], stepsBefore: number, destination: string): Promise<ItineraryDraft> {
  let note = "";
  for (let plan = 1; plan <= MAX_PLANS; plan++) {
    const draft = await askWithRetries({
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      request: note ? `${request}\n\n${note}` : request,
      toolName: "create_itinerary",
      toolDescription: `Save the day-by-day itinerary: exactly ${dates.length} entries in "days", one per day you were asked to plan.`,
      // The exact number of days goes INTO the tool's schema (minItems/maxItems), so the AI sees it
      // right where it writes the list. It used to stop a day short ("expected 10 days but got 9").
      schema: ItineraryDraftSchema.extend({ days: ItineraryDraftSchema.shape.days.length(dates.length) }),
      temperature: 0.6, // a bit of creativity, but not too random
      // The most the AI may write. Each day is ~900 tokens of JSON, and this model also "thinks"
      // before answering (reasoning tokens), which count too. At a fixed 8,000 a 10-day trip was cut
      // off mid-JSON ("Failed to parse tool call arguments"). So it grows with the number of days.
      // It's only a ceiling: we pay for what's actually written.
      maxTokens: 6000 + 2000 * dates.length,
    });

    const fixed = await fixBrokenDays(draft, dates, destination);
    if (fixed.ok) return numberJourney(fixed.draft, stepsBefore);
    note = `A previous plan was rejected: ${fixed.error}. Make sure this one doesn't have that problem.`;
    console.warn(`planTrip: plan ${plan} couldn't be fixed:`, fixed.error);
  }
  throw new Error(`The AI couldn't produce a valid plan. Last error: ${note}`);
}

// Check every day; send each broken one back to the AI with the reason, to fix just that day.
async function fixBrokenDays(
  draft: ItineraryDraft,
  dates: Date[],
  destination: string,
): Promise<{ ok: true; draft: ItineraryDraft } | { ok: false; error: string }> {
  const days: Day[] = [];
  for (const [i, aiDay] of draft.days.entries()) {
    const label = `Day ${i + 1}`;
    const day = tidyDay(aiDay, dates[i]);
    const problem = findDayProblem(day.activities, label);
    if (!problem) {
      days.push(day);
      continue;
    }
    // Most broken days only break the airport rule, or a card starts before a leg has landed.
    // That's arithmetic, so try code first: instant and free. An AI fix takes ~30s per day (once,
    // 5 broken days took 5 minutes).
    const retimed = pushCardsLater(day.activities);
    if (retimed && !findDayProblem(retimed, label)) {
      console.log(`planTrip: ${label}: re-timed in code (${problem})`);
      days.push({ activities: retimed });
      continue;
    }
    console.log(`planTrip: fixing ${label} only: ${problem}`);
    try {
      days.push(await fixDay(day, label, dates[i], destination, problem));
    } catch (error) {
      if (isDailyLimit(error)) throw error; // no point trying anything else today
      return { ok: false, error: problem };
    }
  }
  return { ok: true, draft: { ...draft, days } };
}

// One small AI call: this day's cards + what's wrong -> the corrected day.
async function fixDay(day: Day, label: string, date: Date, destination: string, problem: string): Promise<Day> {
  const fixed = await askWithRetries({
    systemPrompt: FIX_DAY_SYSTEM_PROMPT,
    request: `Trip to ${destination}. ${label} (${formatDay(date)}) breaks a rule: ${problem}.\n\nThe day's cards now (JSON):\n${JSON.stringify(day.activities)}`,
    toolName: "fix_day",
    toolDescription: "Save the corrected day: every card, in time order.",
    schema: DayFixSchema,
    temperature: 0.2, // a careful correction, not new ideas
    maxTokens: 6000,
    attempts: 2,
    check: (result) => findDayProblem(tidyDay(result, date).activities, label),
  });
  return tidyDay(fixed, date);
}

// What code corrects on every AI day before checking it: things that are arithmetic or easy to
// get wrong, so they never cost an AI retry.
function tidyDay(day: Day, date: Date): Day {
  return { activities: day.activities.map((card) => withZoneArrival(withoutFlightNumber(shortenHotelStay(card)), date)) };
}

// A transport leg's local arrival time, worked out from the time zones the AI named (timeZones.ts).
// Keeps the AI's own arrivalTime when it gave no zones, or a zone that doesn't exist.
function withZoneArrival(card: DraftActivity, date: Date): DraftActivity {
  const { startTime, fromTimeZone, toTimeZone } = card;
  if (card.category !== "transport" || !startTime || !fromTimeZone || !toTimeZone) return card;
  const arrivalTime = arrivalTimeFor({ startTime, durationMin: card.durationMin, fromTimeZone, toTimeZone }, date);
  return arrivalTime ? { ...card, arrivalTime } : card;
}

// Flight numbers are invented: the AI can't look up real ones, and "TK 726" once appeared on three
// different routes. So a flight names only its airline: "Flight: Paris (CDG) → Barcelona (BCN),
// Vueling". The pattern is an airline code (2 letters, or a letter and a digit like "6E") and a
// number: "TK 726", "VY1234", "6E 6123".
function withoutFlightNumber(card: DraftActivity): DraftActivity {
  if (!isFlight(card)) return card;
  const title = card.title
    .replace(/\s*\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{1,4}\b/g, "")
    .replace(/\s*\(\s*\)/g, "") // brackets left empty: "SpiceJet (A320)" -> "SpiceJet"
    .trim();
  return title ? { ...card, title } : card;
}

// A hotel card is the check-in (30 minutes; the board's other hotel cards are too). The AI sometimes
// gives it the whole night ("19:30 Hotel Jazz, 720 min" lasts until 07:30 and clashes with dinner
// at 20:30), and that used to cost an AI fix. The night is never a card, so shorten it in code.
const CHECK_IN_MIN = 30;
function shortenHotelStay(card: DraftActivity): DraftActivity {
  if (card.category !== "lodging" || card.durationMin <= 2 * CHECK_IN_MIN) return card;
  return { ...card, durationMin: CHECK_IN_MIN };
}

// Timing problems fixed in code, by moving cards later:
// - the airport rule: the AI often has the cab reach the airport 30 minutes before take-off. The
//   flight moves later by the missing time.
// - a card that starts before the one above it ends (often after a leg's arrival time was
//   corrected for time zones). It moves to when that card ends.
// The cards after a moved one move only as far as they have to: free time before a card soaks up
// the move, but a transport leg keeps its gap to the card before it (that's the layover, or the
// time to get out of the airport).
// null when a card can't move that far (past midnight, or outside its opening hours): the AI then
// fixes the day instead.
function pushCardsLater(activities: Day["activities"]): Day["activities"] | null {
  const result: Day["activities"] = [];
  let shift = 0; // how many minutes later the current card moves
  // The last card with a time: as moved, and where it ended in the AI's plan.
  let before: { card: DraftActivity; originalEnd: number } | null = null;

  for (const card of activities) {
    if (!card.startTime) {
      result.push(card);
      continue;
    }
    const start = toMinutes(card.startTime);
    if (before) {
      if (card.category !== "transport") shift = Math.max(0, shift - (start - before.originalEnd));
      // Never start before the card above has ended (+30 minutes to get out of the airport after
      // a flight lands).
      const earliest = endMinutes(before.card) + (isFlight(before.card) ? LEAVE_AIRPORT_MIN : 0);
      shift += Math.max(0, earliest - (start + shift));
      // A flight after anything but another flight (a connection) starts 2-3 hours after it ends.
      if (isFlight(card) && !isFlight(before.card)) {
        const missing = endMinutes(before.card) + flightBufferMin(card) - (start + shift);
        if (missing > 0) shift += missing;
      }
    }
    const moved = shift > 0 ? moveLater(card, shift) : card;
    if (!moved) return null;
    result.push(moved);
    before = { card: moved, originalEnd: endMinutes(card) };
  }
  return result;
}

// The card `minutes` later. A leg's arrival moves with it (a flight leaving 2 hours later lands
// 2 hours later). null if that doesn't fit the day or the place's opening hours.
function moveLater(card: DraftActivity, minutes: number): DraftActivity | null {
  const start = toMinutes(card.startTime!) + minutes;
  // Only a hotel or an overnight leg may run past midnight (the board has the same rule).
  const overnightOk = card.category === "lodging" || card.category === "transport";
  if (start >= END_OF_DAY || (start + card.durationMin > END_OF_DAY && !overnightOk)) return null;

  const startTime = minutesToTime(start);
  if (checkTimeAgainstHours(card, startTime)) return null;
  // minutesToTime wraps past midnight: an arrival moved from 23:00 to 25:00 becomes "01:00" (the
  // next day, which endMinutes understands).
  const arrivalTime = card.arrivalTime ? minutesToTime(toMinutes(card.arrivalTime) + minutes) : card.arrivalTime;
  return { ...card, startTime, arrivalTime };
}

// Journey legs numbered 1, 2, 3... in the order they happen (day by day, top to bottom), carrying
// on from earlier parts of a long trip. Done in code: the numbers only record the order, so there's
// nothing for the AI to get wrong (a wrong number used to cost a whole new plan).
function numberJourney(draft: ItineraryDraft, stepsBefore: number): ItineraryDraft {
  let step = stepsBefore;
  return {
    ...draft,
    days: draft.days.map((day) => ({
      activities: day.activities.map((a) => (a.journeyStep != null ? { ...a, journeyStep: ++step } : a)),
    })),
  };
}

// Groq's daily token limit: nothing will work again for a while, so stop instead of retrying.
function isDailyLimit(error: unknown): boolean {
  return String(error).includes("per day");
}

// The whole trip in one line per day: where they are, and what the day is about.
function outlineTrip(request: string, dates: Date[]): Promise<TripOutline> {
  return askWithRetries({
    systemPrompt: OUTLINE_SYSTEM_PROMPT,
    request,
    toolName: "outline_trip",
    toolDescription: `Save the one-line-per-day outline of the whole trip: exactly ${dates.length} entries in "days".`,
    schema: TripOutlineSchema.extend({ days: TripOutlineSchema.shape.days.length(dates.length) }),
    temperature: 0.5,
    maxTokens: 4000 + 150 * dates.length,
  });
}

// The instructions for one part of a long trip: the outline, which days to plan now, and where
// the previous part left off (the last cards, the hotel, the journey numbering).
function describePart(
  outline: TripOutline,
  dates: Date[],
  from: number,
  to: number,
  planned: ItineraryDraft["days"],
  lastStep: number,
): string {
  const outlineLines = outline.days
    .map((day, i) => `Day ${i + 1} (${formatDay(dates[i])}) · ${day.city} · ${day.plan}`)
    .join("\n");
  const isFirst = from === 0;
  const isLast = to === dates.length;

  const rules = [`Plan ONLY days ${from + 1} to ${to} now: exactly ${to - from} entries in "days", following the outline.`];
  if (!isFirst) {
    const previousDay = planned[planned.length - 1].activities;
    const lastCards = previousDay.slice(-2).map((a) => `${a.startTime ?? ""} ${a.title}`.trim()).join(", ");
    const hotel = planned.flatMap((d) => d.activities).filter((a) => a.category === "lodging").pop();
    rules.push(
      `Days 1-${from} are already planned. Day ${from} ended with: ${lastCards}.` +
        (hotel ? ` They're staying at ${hotel.title}; only add a hotel card when they move to a new one.` : ""),
      "Don't plan the journey from home again.",
    );
  }
  if (!isLast) rules.push(`Days ${to + 1}-${dates.length} are planned later. Don't plan the journey home yet.`);
  rules.push(`Journey legs used so far: ${lastStep}. Number new journey legs from ${lastStep + 1}.`);
  rules.push(`"title" and "destination": "${outline.title}" and "${outline.destination}".`);

  return `This trip is long, so it's planned in parts. The whole trip, one line per day:
${outlineLines}

${rules.map((rule) => `- ${rule}`).join("\n")}`;
}

function lastJourneyStep(days: ItineraryDraft["days"]): number {
  const steps = days.flatMap((d) => d.activities).map((a) => a.journeyStep ?? 0);
  return Math.max(0, ...steps);
}

type AskOptions<T> = {
  systemPrompt: string;
  request: string;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  temperature: number;
  maxTokens: number;
  check?: (data: T) => string | null; // a problem to send back to the AI, or null when it's fine
  attempts?: number; // default MAX_ATTEMPTS
};

// Ask the AI to call ONE tool, check its answer (JSON → Zod → `check`), and try again with a
// short note when it fails. Shared by the outline and the itinerary (and every part of it).
async function askWithRetries<T>(options: AskOptions<T>): Promise<T> {
  // Describe the tool to the AI. z.toJSONSchema turns our Zod schema into JSON Schema, the format
  // LLM APIs use to describe tool arguments. One schema, two uses: it tells the AI what to produce
  // *and* checks what it produced. We drop "$schema": the AI doesn't need it, and some APIs reject it.
  const parameters: Record<string, unknown> = z.toJSONSchema(options.schema);
  delete parameters.$schema;
  const tool = {
    type: "function" as const,
    function: { name: options.toolName, description: options.toolDescription, parameters },
  };

  let lastError = "";
  for (let attempt = 1; attempt <= (options.attempts ?? MAX_ATTEMPTS); attempt++) {
    // Every attempt is a FRESH, small request. A retry doesn't send back the whole rejected
    // answer (thousands of tokens): that made the request bigger than Groq's free-tier limit
    // (8,000 tokens per minute) and failed with "413 Request too large". A one-line note about
    // what went wrong is enough for the AI to avoid it.
    const userMessage = lastError
      ? `${options.request}\n\nA previous attempt was rejected: ${lastError}. Make sure this one doesn't have that problem.`
      : options.request;

    let response;
    try {
      response = await createCompletion({
        model: SMART_MODEL,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [tool],
        // Force this specific tool, so the AI can't just reply with chat text.
        tool_choice: { type: "function", function: { name: options.toolName } },
        temperature: options.temperature,
        max_completion_tokens: Math.min(65000, options.maxTokens), // the model's maximum is 65,536
      });
    } catch (error) {
      lastError = describeApiError(error);
      console.warn(`${options.toolName} attempt ${attempt} failed at the API:`, lastError);
      if (isDailyLimit(error)) break; // more attempts would fail the same way
      continue;
    }

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
      lastError = `you did not call ${options.toolName}`;
      continue;
    }

    // 1) Valid JSON?  2) Matches our schema?  3) Passes `check` (day count, timeline...)?
    const result = parseAndCheck(toolCall.function.arguments, options.schema, options.check);
    if (result.ok) return result.data;

    lastError = result.error;
    console.warn(`${options.toolName} attempt ${attempt} returned invalid data:`, lastError);
  }

  throw new Error(`The AI couldn't produce a valid plan. Last error: ${lastError}`);
}

// A short version of a Groq error, for the logs and for the retry note. Groq's "broken tool JSON"
// error contains the AI's WHOLE reply (thousands of tokens). Putting that in the retry note would
// make the next request too big again (413), and it floods the terminal.
function describeApiError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("tool_use_failed")) {
    return "your reply was not valid JSON (it may have been cut off: keep descriptions short)";
  }
  return text.slice(0, 300); // keeps the status code ("429 ...") the route uses to spot rate limits
}

// Returns either { ok: true, data } or { ok: false, error } so the caller can decide what to do.
function parseAndCheck<T>(
  rawArguments: string,
  schema: z.ZodType<T>,
  check?: (data: T) => string | null,
): { ok: true; data: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(rawArguments);
  } catch {
    return { ok: false, error: "arguments were not valid JSON" };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    // z.prettifyError turns Zod's error list into readable text the AI can act on.
    return { ok: false, error: z.prettifyError(result.error) };
  }

  const problem = check?.(result.data);
  if (problem) return { ok: false, error: problem };
  return { ok: true, data: result.data };
}

// Zod only checks the SHAPE of the plan. This checks that one day makes sense in time, the way a
// traveler would read it: it reads like a clock (no overlaps, no next-morning times at the end of a
// day), and everything before a flight is over 2-3 hours before take-off.
// Without it, a last day could read "06:30 dinner on the train, 08:00 hotel breakfast".
function findDayProblem(activities: Day["activities"], dayLabel: string): string | null {
  let previous: { title: string; startTime: string; end: number; flight: boolean } | null = null;

  for (const activity of activities) {
    if (!activity.startTime) continue;
    if (!/^\d{2}:\d{2}$/.test(activity.startTime)) {
      return `${dayLabel}: "${activity.title}" has startTime "${activity.startTime}"; use 24h "HH:MM"`;
    }
    const start = toMinutes(activity.startTime);
    if (activity.arrivalTime && !/^\d{2}:\d{2}$/.test(activity.arrivalTime)) {
      return `${dayLabel}: "${activity.title}" has arrivalTime "${activity.arrivalTime}"; use 24h "HH:MM"`;
    }
    if (previous && start < previous.end) {
      return `${dayLabel}: "${activity.title}" starts at ${activity.startTime}, before "${previous.title}" (${previous.startTime}) ends at ${minutesToTime(previous.end)}. Each activity must start after the previous one ends, and every time must be on that same day. A leg that arrives the next day is the last card of its day`;
    }
    // The airport rule: whatever comes before a flight (except a connecting flight) ends 2 hours
    // before a short flight (3 hours or less), 3 hours before a long one.
    const buffer = flightBufferMin(activity);
    if (previous && !previous.flight && isFlight(activity) && previous.end > start - buffer) {
      return `${dayLabel}: "${previous.title}" ends at ${minutesToTime(previous.end)}, less than ${buffer / 60} hours before "${activity.title}" (${activity.startTime}). Everything before a flight, including the transfer to the airport, must end at least ${buffer / 60} hours before take-off (2 hours for a flight of 3 hours or less, 3 for a longer one)`;
    }
    // endMinutes: a leg with an arrivalTime ends at its LOCAL arrival time (time zones).
    previous = { title: activity.title, startTime: activity.startTime, end: endMinutes(activity), flight: isFlight(activity) };
  }
  return null;
}
