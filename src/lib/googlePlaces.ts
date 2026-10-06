// Real places on Google Maps, with Google's Places API (the "New" version).
// Server-only: it uses our secret key, GOOGLE_MAPS_API_KEY, which must never reach the browser.
// Anyone who has the key can make requests that Google bills to our account.
//
// Three steps, because of Google's rules and prices:
//   1. When a trip is planned, findPlaceIds turns each card's placeName ("Ibis Ambassador Seoul
//      Myeongdong") into a place id. An "IDs only" search is free, and a place id is the one
//      thing Google lets us store, so it's saved on the card.
//   2. getPlaceLocations gets each place's map coordinates (for the "can you get there in time?"
//      check, lib/geo.ts). Those may be kept for 30 days, so they're saved with a date.
//   3. When the user opens a card, getPlaceDetails loads that exact place by its id (rating,
//      hours, photo...). Those details may NOT be stored or pre-fetched in bulk, so they're
//      loaded fresh, one card at a time.
import type { GooglePlace } from "@/lib/schemas";
import { googleMapsSearchUrl } from "@/lib/mapsLinks";

const PLACES_URL = "https://places.googleapis.com/v1";

// A "field mask" = the list of fields we want back. Google requires one, and it charges by the
// most expensive field we ask for, so we only ask for what the place panel shows.
const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "googleMapsUri",
  "websiteUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "regularOpeningHours.weekdayDescriptions",
  "photos",
].join(",");

// How many id searches run at the same time. A 30-day trip has ~150 places; sending them all at
// once could hit Google's per-second limit.
const SEARCHES_AT_ONCE = 8;

// The parts of Google's reply we read. Every field can be missing (a small place may have no
// rating, no website, no photos), so they're all optional.
type ApiPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string; authorAttributions?: { displayName: string; uri: string }[] }[];
};

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set in .env");
  return key;
}

// For each search text ("Ibis Ambassador Seoul Myeongdong, Myeongdong, Seoul"), the best match's
// place id, or null (no text, nothing found, or Google unreachable). Never throws: a trip without
// place ids still works, its cards just don't get a Google Maps panel.
export async function findPlaceIds(queries: (string | null)[]): Promise<(string | null)[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return queries.map(() => null);

  const ids: (string | null)[] = [];
  // A few at a time: wait for each batch before starting the next one.
  for (let i = 0; i < queries.length; i += SEARCHES_AT_ONCE) {
    const batch = queries.slice(i, i + SEARCHES_AT_ONCE);
    ids.push(...(await Promise.all(batch.map((query) => (query ? findPlaceId(query) : null)))));
  }
  return ids;
}

async function findPlaceId(query: string): Promise<string | null> {
  try {
    const response = await fetch(`${PLACES_URL}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        // Only the id: that makes it the free "IDs only" search.
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({ textQuery: query, pageSize: 1, languageCode: "en" }),
    });
    if (!response.ok) {
      console.warn(`Google place id search failed (${response.status}) for "${query}":`, (await response.text()).slice(0, 300));
      return null;
    }
    const data: { places?: { id: string }[] } = await response.json();
    return data.places?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export type LatLng = { lat: number; lng: number };

// Map coordinates for each place id (null when unknown). A "Place Details Essentials" request
// (only the `location` field): one of Google's cheapest, with a large free monthly allowance.
// Google lets us keep coordinates for up to 30 days, so the caller saves when it got them.
export async function getPlaceLocations(placeIds: string[]): Promise<Map<string, LatLng | null>> {
  const unique = [...new Set(placeIds)];
  const locations = new Map<string, LatLng | null>();
  if (!process.env.GOOGLE_MAPS_API_KEY) return locations;

  for (let i = 0; i < unique.length; i += SEARCHES_AT_ONCE) {
    const batch = unique.slice(i, i + SEARCHES_AT_ONCE);
    const found = await Promise.all(batch.map(getPlaceLocation));
    batch.forEach((id, j) => locations.set(id, found[j]));
  }
  return locations;
}

async function getPlaceLocation(placeId: string): Promise<LatLng | null> {
  try {
    const response = await fetch(`${PLACES_URL}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": "location" },
    });
    if (!response.ok) return null;
    const data: { location?: { latitude: number; longitude: number } } = await response.json();
    return data.location ? { lat: data.location.latitude, lng: data.location.longitude } : null;
  } catch {
    return null;
  }
}

// Everything the place panel shows, for one place id. null when Google doesn't know the id.
export async function getPlaceDetails(placeId: string): Promise<GooglePlace | null> {
  const response = await fetch(`${PLACES_URL}/places/${encodeURIComponent(placeId)}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": DETAIL_FIELDS },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Google place details failed (${response.status}): ${await response.text()}`);
  }

  const place: ApiPlace = await response.json();
  const name = place.displayName?.text ?? "";
  const photo = place.photos?.[0];
  const author = photo?.authorAttributions?.[0];
  return {
    id: place.id,
    name,
    address: place.formattedAddress ?? null,
    // Built in code if Google leaves it out (never trust anyone else to build our links).
    mapsUrl: place.googleMapsUri ?? googleMapsSearchUrl(name, place.id),
    website: place.websiteUri ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    permanentlyClosed: place.businessStatus === "CLOSED_PERMANENTLY",
    weekdayHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
    photoUrl: photo ? await photoUrl(photo.name) : null,
    // Google's rules: a photo must show who took it.
    photoAuthor: author ? { name: author.displayName, url: author.uri } : null,
  };
}

// A photo's normal address needs our key in the URL, which would leak it to the browser.
// skipHttpRedirect=true makes Google answer with a public image URL instead, safe to show anywhere.
async function photoUrl(photoName: string): Promise<string | null> {
  try {
    const response = await fetch(`${PLACES_URL}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": apiKey() },
    });
    if (!response.ok) return null;
    const data: { photoUri?: string } = await response.json();
    return data.photoUri ?? null;
  } catch {
    return null; // no photo is fine: the panel just doesn't show one
  }
}

// A place id AND its coordinates for each search text (null when not found). What a new card needs.
export async function findPlacesWithLocation(
  queries: (string | null)[],
): Promise<({ googlePlaceId: string; lat: number | null; lng: number | null } | null)[]> {
  const ids = await findPlaceIds(queries);
  const locations = await getPlaceLocations(ids.filter((id): id is string => id !== null));
  return ids.map((id) => {
    if (!id) return null;
    const location = locations.get(id);
    return { googlePlaceId: id, lat: location?.lat ?? null, lng: location?.lng ?? null };
  });
}
