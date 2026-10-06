// Database helpers for trips, shared by pages and API routes.
import { db } from "@/lib/db";
import type { BoardActivity, BoardDay, ChatTurn, ItineraryDraft } from "@/lib/schemas";
import { sortByTime } from "@/lib/feasibility";
import { findPlaceIds, getPlaceLocations } from "@/lib/googlePlaces";

// Load a trip *only if it belongs to this user*.
// Every read or write of a trip must go through a check like this. Otherwise anyone who
// guessed a trip id could see or edit someone else's trip.
export function getTripForUser(tripId: string, userId: string) {
  return db.trip.findFirst({
    where: { id: tripId, userId },
    include: {
      // Nested include: also load the days, and each day's activities, in the right order.
      days: {
        orderBy: { index: "asc" },
        include: { activities: { orderBy: { order: "asc" } } },
      },
    },
  });
}

export type TripWithDays = NonNullable<Awaited<ReturnType<typeof getTripForUser>>>;

// Convert the database rows (from getTripForUser) into the plain shape the board component
// and the AI agent use. Shared so the trip page, the GET route, and the swap-days route
// don't each write their own slightly-different copy of this conversion.
export function toBoardDays(trip: TripWithDays): BoardDay[] {
  return trip.days.map((day) => ({
    id: day.id,
    date: day.date.toISOString(),
    index: day.index,
    // Sorted by start time, so each day always reads in time order (even for older trips).
    activities: sortByTime(
      day.activities.map((a): BoardActivity => ({
        id: a.id,
        title: a.title,
        description: a.description,
        category: a.category as BoardActivity["category"],
        startTime: a.startTime,
        durationMin: a.durationMin,
        locationName: a.locationName,
        estCost: a.estCost,
        openTime: a.openTime,
        closeTime: a.closeTime,
        journeyStep: a.journeyStep,
        arrivalTime: a.arrivalTime,
        googlePlaceId: a.googlePlaceId,
        lat: a.lat,
        lng: a.lng,
      })),
    ),
  }));
}

// Google lets us keep a place's coordinates for at most 30 days. Older ones (and missing ones, on
// cards that have a place) are fetched again. Called when a trip page opens, so the board always has
// fresh coordinates for the "can you get there in time?" check. Updates `trip` in place too.
const LOCATION_MAX_AGE_MS = 29 * 24 * 60 * 60 * 1000; // a day short of 30, to be safe

export async function refreshLocations(trip: TripWithDays): Promise<void> {
  const cutoff = Date.now() - LOCATION_MAX_AGE_MS;
  const stale = trip.days
    .flatMap((day) => day.activities)
    .filter((a) => a.googlePlaceId && (a.lat === null || !a.locatedAt || a.locatedAt.getTime() < cutoff));
  if (stale.length === 0) return;

  const locations = await getPlaceLocations(stale.map((a) => a.googlePlaceId!));
  const now = new Date();
  const updates = stale.flatMap((a) => {
    const location = locations.get(a.googlePlaceId!);
    if (!location) return []; // Google didn't answer: try again next time
    Object.assign(a, { lat: location.lat, lng: location.lng, locatedAt: now });
    return [db.activity.update({ where: { id: a.id }, data: { lat: location.lat, lng: location.lng, locatedAt: now } })];
  });
  if (updates.length) await db.$transaction(updates);
}

// Make the database match a whole board: delete the cards that are gone, update the ones that
// changed (text, time, position or day), and create the new ones.
// Used by the board's PATCH save and by the chat (an AI edit is saved the same way as a drag).
// `days` must only contain this trip's days (the callers check that).
export async function saveBoard(trip: TripWithDays, days: { id: string; activities: BoardActivity[] }[]) {
  // Only cards already in THIS trip are updated. Any other id is treated as a new card, so a
  // forged id can never touch someone else's activity.
  const existingIds = new Set(trip.days.flatMap((d) => d.activities.map((a) => a.id)));

  const incoming = days.flatMap((day) =>
    // Each card's position in its column becomes its `order`.
    day.activities.map((activity, order) => ({ ...activity, dayId: day.id, order })),
  );

  // $transaction([...]) runs all these queries together: if one fails, none are applied.
  // That way a failed save can never leave the board half-updated.
  await db.$transaction([
    // Cards that are no longer on the board were deleted.
    db.activity.deleteMany({
      where: { day: { tripId: trip.id }, id: { notIn: incoming.map((a) => a.id) } },
    }),
    // Existing cards: update them (new position, day or text). New cards: create them.
    ...incoming.map((a) =>
      existingIds.has(a.id)
        ? db.activity.update({ where: { id: a.id }, data: a })
        : // A new card with coordinates (added by the chat): Google's 30-day limit starts now.
          db.activity.create({ data: { ...a, locatedAt: a.lat !== null ? new Date() : null } }),
    ),
  ]);
}

// A trip's saved chat, oldest first. Only call this AFTER getTripForUser has checked ownership.
export async function getChatMessages(tripId: string): Promise<ChatTurn[]> {
  const rows = await db.chatMessage.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
  return rows.map((m) => ({ role: m.role as ChatTurn["role"], content: m.content }));
}

// The AI's itinerary with each specific place's Google place id looked up (from its placeName,
// near its location). Done once, when the plan is made, so opening a card finds the RIGHT place.
// Cards with the same placeName (the hotel, and breakfast at that hotel) share ONE search, so they
// always get the same place. Searched separately, a hotel and its breakfast once matched two
// different hotels.
export async function withPlaceIds(draft: ItineraryDraft) {
  const cards = draft.days.flatMap((day) => day.activities);
  const queries = new Map<string, string>(); // placeName (lowercase) -> search text, first card wins
  for (const a of cards) {
    const key = a.placeName?.trim().toLowerCase();
    if (key && !queries.has(key)) queries.set(key, `${a.placeName}, ${a.locationName ?? draft.destination}`);
  }
  const names = [...queries.keys()];
  const ids = await findPlaceIds(names.map((name) => queries.get(name)!));
  const idFor = new Map(names.map((name, i) => [name, ids[i]]));
  // And where each place is, for the "can you get there in time?" check (lib/geo.ts).
  const locations = await getPlaceLocations(ids.filter((id): id is string => id !== null));

  return {
    ...draft,
    days: draft.days.map((day) => ({
      activities: day.activities.map((a) => {
        const googlePlaceId = idFor.get(a.placeName?.trim().toLowerCase() ?? "") ?? null;
        const location = googlePlaceId ? locations.get(googlePlaceId) : null;
        return { ...a, googlePlaceId, lat: location?.lat ?? null, lng: location?.lng ?? null };
      }),
    })),
  };
}

// The AI's itinerary (planTrip + withPlaceIds) as rows for a Prisma *nested create*: one Day per
// date, each with its activities. Used when a trip is created, and when Edit trip re-plans it.
export function daysFromDraft(dates: Date[], draft: Awaited<ReturnType<typeof withPlaceIds>>) {
  return dates.map((date, dayIndex) => ({
    date,
    index: dayIndex,
    activities: {
      create: draft.days[dayIndex].activities.map((a, order) => ({
        title: a.title,
        description: a.description ?? null, // ?? turns undefined into null
        category: a.category,
        startTime: a.startTime ?? null,
        durationMin: a.durationMin,
        locationName: a.locationName ?? null,
        estCost: a.estCost ?? null,
        openTime: a.openTime ?? null,
        closeTime: a.closeTime ?? null,
        journeyStep: a.journeyStep ?? null,
        arrivalTime: a.arrivalTime ?? null,
        googlePlaceId: a.googlePlaceId,
        lat: a.lat,
        lng: a.lng,
        locatedAt: a.lat !== null ? new Date() : null, // Google's 30-day limit starts now
        order,
      })),
    },
  }));
}
