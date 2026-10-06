// Google Maps place details for the cards, loaded at most once per card per visit.
// The board starts loading a card's place when the mouse moves onto it (or it gets keyboard focus),
// so it's usually ready by the time the card is clicked.
// Kept in memory only, never saved: Google's rules don't allow storing their place details, or
// fetching them in bulk ahead of time. Loading on hover is one card at a time, when it's wanted.
import type { BoardActivity, GooglePlace } from "@/lib/schemas";

export type PlaceLookup =
  | { status: "found"; place: GooglePlace }
  | { status: "missing" }
  | { status: "error"; message: string };

// Keyed by card AND place, so a card whose place changed (renamed by the chat) loads again.
const keyOf = (activity: BoardActivity) => `${activity.id}:${activity.googlePlaceId}`;
const pending = new Map<string, Promise<PlaceLookup>>();
const finished = new Map<string, PlaceLookup>();

// The result, if it has already arrived (lets the panel open with the details already in it).
export function peekPlace(activity: BoardActivity): PlaceLookup | undefined {
  return finished.get(keyOf(activity));
}

// Start loading (or reuse the load already started) and get the result when it arrives.
export function loadPlace(tripId: string, activity: BoardActivity): Promise<PlaceLookup> {
  const key = keyOf(activity);
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = fetch(`/api/trips/${tripId}/place?activityId=${encodeURIComponent(activity.id)}`)
    .then(async (response): Promise<PlaceLookup> => {
      const data = await response.json();
      if (!response.ok) return { status: "error", message: data.error ?? "Couldn't reach Google Maps." };
      return data.place ? { status: "found", place: data.place } : { status: "missing" };
    })
    .catch((): PlaceLookup => ({ status: "error", message: "Couldn't reach Google Maps." }))
    .then((result) => {
      if (result.status === "error") pending.delete(key); // an error is worth retrying next time
      else finished.set(key, result);
      return result;
    });
  pending.set(key, promise);
  return promise;
}
