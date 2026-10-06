// "Can you actually get there in time?" An instant (no AI) check that uses each card's map
// coordinates (from its Google place, see googlePlaces.ts). It caught what the time checks missed:
// a café in Jeju at 19:15, right after the train into Seoul arrived at 19:15.
//
// How it works, for one day in time order: between two cards we know the location of, could you
// cover the distance in the time between them? Without a transport card in between, you travel by
// road (a taxi or a walk that isn't its own card). A transport card in between (a flight, a train)
// covers much more ground. A transport card's location is where it ARRIVES (Seoul Station).
// The speeds are deliberately generous, so only clearly impossible plans are flagged.
import type { BoardActivity } from "@/lib/schemas";
import { endMinutes } from "@/lib/feasibility";
import { minutesToTime, toMinutes } from "@/lib/openHours";

// Getting between two places without a transport card (a cab, a bus, a walk), km per hour.
const ROAD_KMH = 50;
// Room for error: the next street, or a place's coordinates being its centre.
const SLACK_KM = 15;

// How far a transport card can take you per hour, by what it says it is.
function transportKmh(activity: Pick<BoardActivity, "title">): number {
  const title = activity.title.toLowerCase();
  if (/flight|fly/.test(title)) return 900;
  if (/train|ktx|rail|metro|arex|express|shinkansen/.test(title)) return 300;
  if (/ferry|boat|cruise/.test(title)) return 40;
  return 80; // bus, cab, car
}

// The distance between two points on Earth, in km ("haversine": the straight line over the globe).
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)); // 6371 km = the Earth's radius
}

// `cardId` = the card you can't get to in time (the one the warning belongs on).
export type PlaceProblem = { key: string; cardId: string; message: string };

// Every "you can't get there in time" problem in one day's cards.
// `key` names the two cards, so a caller can tell a NEW problem from one that was already there.
export function findPlaceProblems(activities: BoardActivity[]): PlaceProblem[] {
  const timed = activities
    .filter((a) => a.startTime)
    .sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));

  const problems: PlaceProblem[] = [];
  // The last card we know the location of, and how far the transport since then could take you.
  let last: BoardActivity | null = null;
  let transportKm = 0;

  for (const card of timed) {
    const located = card.lat !== null && card.lng !== null;
    const isTransport = card.category === "transport";

    if (!located) {
      // A transport card without a location still moves you: count how far it could take you.
      if (isTransport) transportKm += (card.durationMin / 60) * transportKmh(card);
      continue;
    }

    if (last) {
      // Road time between the last place and this card's start, plus all the transport in between.
      // A located transport card arrives at its location at its END, so its own ride counts too.
      const gapMinutes = Math.max(0, toMinutes(card.startTime!) - endMinutes(last));
      const ownRideKm = isTransport ? (card.durationMin / 60) * transportKmh(card) : 0;
      const reachableKm = (gapMinutes / 60) * ROAD_KMH + transportKm + ownRideKm + SLACK_KM;
      const km = distanceKm({ lat: last.lat!, lng: last.lng! }, { lat: card.lat!, lng: card.lng! });

      if (km > reachableKm) {
        problems.push({
          key: `${last.id}>${card.id}`,
          cardId: card.id,
          message: `${card.title} is about ${Math.round(km)} km from ${last.title}, and there's no way to cover that between ${minutesToTime(endMinutes(last))} and ${card.startTime}${
            transportKm + ownRideKm > 0 ? " with the transport in between" : ""
          }.`,
        });
        // A place you can't get to is most likely the mistake (the Jeju café in a Seoul evening),
        // so the traveler is still where they were: the next cards are measured from `last`, not
        // from it. Otherwise one misplaced card would also block every card added after it.
        continue;
      }
    }
    last = card;
    transportKm = 0;
  }
  return problems;
}

// The first problem in `after` that wasn't already in `before`, or null. Used so that a change is
// only blocked for a problem it CAUSES, never for an old one elsewhere in the day.
export function findNewPlaceProblem(before: BoardActivity[], after: BoardActivity[]): string | null {
  const existing = new Set(findPlaceProblems(before).map((p) => p.key));
  return findPlaceProblems(after).find((p) => !existing.has(p.key))?.message ?? null;
}
