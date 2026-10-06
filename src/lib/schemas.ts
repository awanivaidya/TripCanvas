// Zod schemas: the "shape rules" for data coming into our app from outside
// (the browser form, the AI, the board). Each schema checks data at runtime, and
// z.infer<> gives us a matching TypeScript type for free.
import { z } from "zod";
import { countTripDays, MAX_TRIP_DAYS } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/currency";

export const CATEGORIES = ["sight", "food", "transport", "lodging", "activity", "free"] as const;

// One saved chat message (the chat that created the trip, then the chat on the trip page).
export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

// ---------- 1. What the "new trip" form sends to POST /api/trips ----------
// Ways to get to the destination and back. "road" = bus or cab.
export const TRANSPORT_MODES = ["flight", "train", "road"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

// The trip "constraints" the user can change later with Edit trip (dates, who's going, how).
// Shared by the new-trip chat and the Edit trip dialog.
const tripDetailsFields = {
  startDate: z.iso.date(), // "2026-10-10"
  endDate: z.iso.date(),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  transport: z.array(z.enum(TRANSPORT_MODES)).max(3), // [] = no preference
  // Where they start from, as confirmed or typed by the user ("Dhing, Assam"). When missing, the
  // server falls back to detecting it from the IP address, which is often wrong (see LEARNING.md).
  origin: z.string().trim().min(2).max(150).optional(),
};

// .refine() adds a custom rule that looks at several fields together. Both schemas below need
// the same date rules, so they live in one helper.
type WithDates = { startDate: string; endDate: string };
function checkDates<T extends z.ZodType<WithDates>>(schema: T) {
  return schema
    .refine((t) => t.endDate >= t.startDate, { message: "End date is before start date" })
    .refine((t) => countTripDays(t.startDate, t.endDate) <= MAX_TRIP_DAYS, {
      message: `Trips can be at most ${MAX_TRIP_DAYS} days for now`,
    });
}

export const TripInputSchema = checkDates(
  z.object({
    ...tripDetailsFields,
    destination: z.string().trim().min(2, "Where are you going?").max(200),
    budget: z.string().trim().max(100).optional(),
    // The currency picked in the chat (defaults to the one detected from their location).
    currency: z.enum(CURRENCY_CODES).optional(),
    // The chat that led to this trip, saved so it continues on the trip page.
    transcript: z.array(ChatTurnSchema).max(80).optional(),
    interests: z.array(z.string().max(40)).max(20), // the 12 chips plus a few typed ones
    // What they eat, as one sentence (describeDiet in lib/diet.ts).
    dietary: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
);
export type TripInput = z.infer<typeof TripInputSchema>;

// What the Edit trip dialog sends to POST /api/trips/[id]/replan.
export const ReplanInputSchema = checkDates(z.object(tripDetailsFields));
export type ReplanInput = z.infer<typeof ReplanInputSchema>;

// ---------- 1b. What the chat "suggest" endpoint takes and returns ----------
// Used by the guided chat intake: when the user is unsure about the destination or dates,
// we ask the AI for a few quick suggestions instead of the full itinerary.
export const SuggestInputSchema = z.object({
  kind: z.enum(["destination", "dates"]),
  // Free text the user already typed, e.g. "somewhere in Japan" or "not sure, whenever's cheap".
  hint: z.string().trim().max(500),
  // For "dates" suggestions we already need to know where, so date suggestions can be season-aware.
  destination: z.string().trim().max(200).optional(),
  // Where the user is ("Dhing, Assam, IN"), so "domestic" means their own country.
  origin: z.string().trim().max(200).optional(),
  // Their answer to "within your country or abroad?", once they've given it.
  scope: z.enum(["domestic", "international"]).optional(),
  // Dates requests: the stretches of days the user is free (from their Google Calendar). When
  // given, every suggested start date must be inside one of them.
  freeRanges: z.array(z.object({ start: z.iso.date(), end: z.iso.date() })).max(8).optional(),
});
export type SuggestInput = z.infer<typeof SuggestInputSchema>;

const DestinationSuggestionSchema = z.object({
  // Short label for a chip, e.g. "Tokyo, Japan"
  label: z.string().min(1).max(60),
});

// Only a START date: the AI suggests *when* to go, but the user decides *how long* to stay
// (the chat asks for the number of days right after they pick one of these).
const StartDateSuggestionSchema = z.object({
  // Short label for a chip, e.g. "Late monsoon · from Sep 20"
  label: z.string().min(1).max(80),
  startDate: z.iso.date(),
  // WHY this time: a real traveler wants to know what makes it special, and what it costs them.
  reason: z
    .string()
    .min(1)
    .max(220)
    .describe('What makes this time special, and one downside, e.g. "Cherry blossoms peak, mild 15-20°C, but the busiest and priciest weeks"'),
});

export const SuggestionsSchema = z.object({
  // A short sentence of context, e.g. "Here are a few ideas around Japan:"
  message: z.string().min(1).max(300),
  // Destination requests only: set when the user named one OR MORE specific places, joined into
  // one name with the region: "Goa, India" or "Markham Valley & Rapleng Valley, Meghalaya, India".
  place: z
    .string()
    .max(200)
    .nullish()
    .describe("Every specific place they named, as one name with district, state and country; else null"),
  // Named places the AI can't pin down confidently (small or obscure ones). The chat then asks the
  // user which district they're in, instead of letting the AI guess (it guessed wrong before).
  unsurePlaces: z.array(z.string().max(80)).max(6).nullish(),
  // Destination requests only: did they say whether they want to stay in their country or go abroad?
  scope: z.enum(["domestic", "international"]).nullish(),
  // .nullish(), not .optional(): the AI often sends null for "not this time", and Groq rejects the
  // whole reply when null isn't allowed by the schema (that cost a retry before).
  destinations: z.array(DestinationSuggestionSchema).max(5).nullish(),
  startDates: z.array(StartDateSuggestionSchema).max(4).nullish(),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

// ---------- 2. What the AI must return (the create_itinerary tool's arguments) ----------
// .nullish() = may be missing OR null. LLMs often send null for "no value".
const DraftActivitySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  category: z.enum(CATEGORIES),
  // The AI reads these descriptions in the tool's schema, right where it fills in each field: the
  // best place to repeat the rules it breaks most often.
  startTime: z.string().nullish().describe('24h time like "09:30", at or after the end of the card before it'),
  durationMin: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .describe("Minutes. A transport leg: the real travel time. A lodging card: 30 (the check-in, NOT the night's stay)"),
  locationName: z.string().nullish(),
  estCost: z.string().nullish().describe('Rough cost like "~$15" or "free"'),
  // Real-world opening hours, only when the place actually keeps fixed hours (a museum,
  // an attraction, a shop). Left null for things open anytime (a park, a walk, transport,
  // free time). Used later to stop the user from dragging a card to a time the place is shut.
  openTime: z.string().nullish().describe('24h time like "09:00", only if this place has fixed hours'),
  closeTime: z.string().nullish().describe('24h time like "18:00", only if this place has fixed hours'),
  // The journey from home and back, numbered in travel order (see PLANNER_SYSTEM_PROMPT).
  journeyStep: z
    .number()
    .int()
    .min(1)
    .nullish()
    .describe("Only for legs of the journey from home and back: 1, 2, 3... in travel order, across the whole trip"),
  // The name to find this place on Google Maps by. Turned into a googlePlaceId in code (trips.ts).
  placeName: z
    .string()
    .nullish()
    .describe('The exact name of ONE specific real place, as on Google Maps, e.g. "Ibis Ambassador Seoul Myeongdong"; null if not one place'),
  // Local time at the arrival place. Across time zones, start + duration gives the wrong clock time.
  arrivalTime: z
    .string()
    .nullish()
    .describe('Transport only: 24h LOCAL time at the arrival place, e.g. "20:30". Earlier than startTime = arrives the next day'),
  // The time zones a leg leaves from and arrives in. The AI names them (it knows them well); code
  // works out arrivalTime from them (lib/timeZones.ts), because its own clock sums were often wrong.
  fromTimeZone: z
    .string()
    .nullish()
    .describe('Transport only: IANA time zone where the leg leaves, e.g. "Asia/Kolkata"'),
  toTimeZone: z
    .string()
    .nullish()
    .describe('Transport only: IANA time zone where the leg arrives, e.g. "Europe/Paris"'),
});

export const ItineraryDraftSchema = z.object({
  title: z.string().min(1).describe("Short catchy trip title"),
  // Saved as the trip's destination, so the board, the title and "Getting there" all agree.
  destination: z.string().min(1).max(100).describe('The specific place this trip is in, e.g. "Puri, Odisha"'),
  days: z.array(
    z.object({
      activities: z.array(DraftActivitySchema).min(1),
    }),
  ),
});
export type ItineraryDraft = z.infer<typeof ItineraryDraftSchema>;

// ---------- 3. What the board sends to PATCH /api/trips/[id] ----------
// The board always sends its *entire* current state. The server makes the database match it.
// Simple to reason about: one save handles moves, edits, adds and deletes.
export const BoardActivitySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable(),
  category: z.enum(CATEGORIES),
  startTime: z.string().max(10).nullable(),
  durationMin: z.number().int().min(5).max(24 * 60),
  locationName: z.string().max(200).nullable(),
  estCost: z.string().max(50).nullable(),
  openTime: z.string().max(10).nullable(),
  closeTime: z.string().max(10).nullable(),
  journeyStep: z.number().int().min(1).nullable(),
  arrivalTime: z.string().max(10).nullable(),
  googlePlaceId: z.string().max(300).nullable(),
  // Map coordinates of that place (null = unknown), for the "can you get there in time?" check.
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export type BoardActivity = z.infer<typeof BoardActivitySchema>;

export const BoardSaveSchema = z.object({
  days: z.array(z.object({ id: z.string(), activities: z.array(BoardActivitySchema) })),
});
export type BoardSave = z.infer<typeof BoardSaveSchema>;

// The shape of one day on the board (what the page passes to the client component).
export type BoardDay = { id: string; date: string; index: number; activities: BoardActivity[] };

// ---------- 4. Day swap: is it OK to swap two days' activities? ----------
// Sent to POST /api/trips/[id]/swap-days when the user drags one day column onto another.
export const SwapDaysInputSchema = z.object({
  dayAId: z.string().min(1),
  dayBId: z.string().min(1),
});
export type SwapDaysInput = z.infer<typeof SwapDaysInputSchema>;

// What the AI decides. "allowed: false" blocks the swap outright (e.g. different cities).
// "allowed: true" may still come with adjustments — activities whose details need to change
// after the swap (e.g. an "Arrival in Tokyo" card should stay conceptually on the earliest day).
export const SwapDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1).max(400).describe("One short sentence explaining the decision"),
  // Only present when allowed: a few activities that should be tweaked after swapping, e.g.
  // renaming "Arrival in Tokyo" if it moved, or adjusting a time. Empty array = swap as-is.
  adjustments: z
    .array(
      z.object({
        activityId: z.string(),
        field: z.enum(["title", "description", "startTime"]),
        newValue: z.string(),
        why: z.string().max(200),
      }),
    )
    .max(10)
    .optional(),
});
export type SwapDecision = z.infer<typeof SwapDecisionSchema>;

// ---------- 4b. Moving one card to another day: does it still make sense? ----------
// Sent to POST /api/trips/[id]/check-move after the user drags a card into a different day.
export const CheckMoveInputSchema = z.object({
  activityId: z.string().min(1),
  toDayId: z.string().min(1),
});
export type CheckMoveInput = z.infer<typeof CheckMoveInputSchema>;

export const MoveDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1).max(200).describe("Very short reason, at most 12 words"),
});
export type MoveDecision = z.infer<typeof MoveDecisionSchema>;

// ---------- 5. Getting there: door-to-door travel routes (mock data, for now — see TravelPanel) ----------
// Returned by GET /api/trips/[id]/travel.
// A ROUTE is one complete way to get from home to the destination. It's made of LEGS, one per
// vehicle: e.g. train Dhing → Guwahati, then flight Guwahati → Bagdogra, then cab to Darjeeling.
export const TRAVEL_MODES = ["train", "flight", "bus", "cab", "ferry"] as const;

const TravelLegSchema = z.object({
  mode: z.enum(TRAVEL_MODES),
  from: z.string().min(1).max(80).describe('Station/airport and town, e.g. "Guwahati Airport (GHY)"'),
  to: z.string().min(1).max(80),
  service: z
    .string()
    .min(1)
    .max(80)
    .describe('Train name + number, airline + flight number, or operator, e.g. "15817 Intercity Express"'),
  departTime: z.string().min(1).max(10).describe('24h time like "06:45"'),
  arriveTime: z.string().min(1).max(10),
  durationLabel: z.string().min(1).max(30).describe('e.g. "3h 20m"'),
  price: z.number().nonnegative().describe("per person, in the traveler's home currency, no symbol"),
});

const TravelRouteSchema = z.object({
  label: z.string().min(1).max(60).describe('e.g. "Fastest: train + flight" or "Cheapest: all by train"'),
  totalDurationLabel: z.string().min(1).max(30).describe("door to door, including waiting between legs"),
  legs: z.array(TravelLegSchema).min(1).max(6),
});

export const TravelOptionsSchema = z.object({
  // A short disclaimer-ish note the UI shows above the results.
  note: z.string().min(1).max(250),
  routes: z.array(TravelRouteSchema).min(1).max(3),
});
export type TravelOptions = z.infer<typeof TravelOptionsSchema>;
export type TravelLeg = z.infer<typeof TravelLegSchema>;

// ---------- 6. Chat edits: "make day 2 more relaxed" ----------
// What the trip page's chat sends to POST /api/trips/[id]/chat.
export const ChatInputSchema = z.object({ message: z.string().trim().min(1).max(2000) });

// One card in the AI's edited version of a day.
// - Existing card: its id + ONLY the fields that change (e.g. { id, startTime: "15:00" }).
//   Missing fields keep their current value, so the AI never has to copy whole cards.
// - New card: id null, plus at least title, category and durationMin.
// Every field is .nullish(): LLMs often send null for "nothing to say here".
const EditActivitySchema = z.object({
  id: z.string().nullish().describe("The card's current id to keep or change it; null for a new card"),
  title: z.string().min(1).nullish(),
  description: z.string().nullish(),
  category: z.enum(CATEGORIES).nullish(),
  startTime: z.string().nullish().describe('24h time like "09:30"'),
  durationMin: z.number().int().min(5).max(24 * 60).nullish(),
  locationName: z.string().nullish(),
  estCost: z.string().nullish(),
  openTime: z.string().nullish(),
  closeTime: z.string().nullish(),
  journeyStep: z.number().int().min(1).nullish(),
  arrivalTime: z.string().nullish().describe('Transport only: 24h LOCAL time at the arrival place'),
  placeName: z
    .string()
    .nullish()
    .describe("New or renamed cards: the exact Google Maps name of the ONE specific place; null if not one place"),
});
export type EditActivity = z.infer<typeof EditActivitySchema>;

// Deleting is explicit: a card is only removed when its id is in `remove`. It used to be "a card
// left out of a day you send is deleted", and the AI once sent a day with just the one card it
// changed: the other 6 cards of that day were on the list to be deleted.
export const TripEditSchema = z.object({
  reply: z.string().min(1).max(1500).describe("What you changed (or your answer), in 1-3 friendly sentences"),
  // Only the days that change. Leave out (or send []) when the message needs no board change.
  days: z
    .array(
      z.object({
        dayNumber: z.number().int().min(1).describe("1 = the first day of the trip"),
        activities: z
          .array(EditActivitySchema)
          .describe("ONLY the cards to add, change or move to this day. Cards you don't list stay as they are"),
      }),
    )
    .nullish(),
  remove: z.array(z.string()).nullish().describe("ids of the cards to delete. Nothing else is deleted"),
});
export type TripEdit = z.infer<typeof TripEditSchema>;

// ---------- 7. A real place on Google Maps (the place panel) ----------
// Not an AI schema: it comes from Google's Places API (src/lib/googlePlaces.ts), so it's a plain
// type with no Zod. Google's rules only allow storing the place `id`, so the rest is fetched fresh.
export type GooglePlace = {
  id: string;
  name: string;
  address: string | null;
  mapsUrl: string;
  website: string | null;
  rating: number | null; // 1 to 5 stars
  ratingCount: number | null;
  permanentlyClosed: boolean;
  // 7 lines, Monday first: "Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed"...
  weekdayHours: string[] | null;
  photoUrl: string | null;
  photoAuthor: { name: string; url: string } | null;
};

// ---------- 8. The chat AI's event search tool ----------
// Before adding a concert, festival or match, the chat AI searches real listings (lib/events.ts).
export const EventSearchSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(120)
    .describe('What to search for, with the city, e.g. "K-pop concerts in Seoul" or "football matches in Barcelona"'),
});

// ---------- 9. Long trips: a one-line-per-day outline first (planTrip.ts) ----------
// A 30-day plan is too long for one AI reply, so the planner first outlines the whole trip, then
// plans it in parts that follow this outline.
export const TripOutlineSchema = z.object({
  title: z.string().min(1).describe("Short catchy trip title"),
  destination: z.string().min(1).max(100).describe('Every place of the trip, e.g. "Barcelona, Spain & Paris, France"'),
  days: z.array(
    z.object({
      city: z.string().min(1).max(80).describe("Where the traveler is that day (where they sleep)"),
      plan: z.string().min(1).max(160).describe('What the day is about, under 15 words, e.g. "Fly Bangalore → Barcelona"'),
    }),
  ),
});
export type TripOutline = z.infer<typeof TripOutlineSchema>;

// ---------- 10. Apply or discard a chat proposal ----------
// The chat AI only PROPOSES board changes. What the traveler chose is noted in the chat history.
export const ChatDecisionSchema = z.object({ decision: z.enum(["applied", "discarded"]) });

// ---------- 11. Fixing one day of a plan (planTrip.ts) ----------
// When one day breaks a timing rule, only that day goes back to the AI (much cheaper than the
// whole trip). Same card shape as the itinerary.
export const DayFixSchema = z.object({ activities: ItineraryDraftSchema.shape.days.element.shape.activities });

// ---------- 12. Understanding a free-typed message in the new-trip chat ----------
// The chat is a fixed list of questions, but people don't always answer the question in front of
// them: "I want to see cherry blossoms" (typed at the budget step) really changes the DATES.
// A small AI call reads the message and says what it means (agent/interpret.ts).
export const INTAKE_QUESTIONS = ["destination", "dates", "travelers", "origin", "transport", "interests", "diet", "budget"] as const;

export const InterpretInputSchema = z.object({
  message: z.string().trim().min(1).max(500),
  // The question they were on when they typed it ("review" = the summary before planning).
  step: z.enum([...INTAKE_QUESTIONS, "review"]),
  // Their answers so far, as short text: { destination: "Kyoto, Japan", dates: "Apr 15 - Apr 24 2027" }
  answers: z.record(z.string(), z.string().max(400)),
});
export type InterpretInput = z.infer<typeof InterpretInputSchema>;

export const InterpretationSchema = z.object({
  kind: z
    .enum(["answer", "change", "question"])
    .describe("answer: it answers the current question. change: an EARLIER answer should change. question: they're asking something"),
  change: z.enum(INTAKE_QUESTIONS).nullish().describe("Only for kind=change: which answer changes"),
  wish: z
    .string()
    .max(150)
    .nullish()
    .describe('Something they want to see or do on the trip, in a few words, e.g. "see cherry blossoms"; null if none'),
  reply: z.string().min(1).max(500).describe("1-3 friendly sentences: answer their question, or say what changes and why"),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;
