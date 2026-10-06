// Google Maps links, built in code (never by the AI). Client-safe: no secret key in here.

// A link that opens Google Maps searching for a place. Works in the browser and the Maps app,
// with no key. With a placeId, Google opens that exact place.
// https://developers.google.com/maps/documentation/urls/get-started
export function googleMapsSearchUrl(query: string, placeId?: string): string {
  const params = new URLSearchParams({ api: "1", query });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

// The address of an embedded map (Maps Embed API) showing one place, or null when the embed key
// isn't set. This key is PUBLIC on purpose (it's in the page), so in Google Cloud it's locked to
// our website's address and to the Embed API only, where it's free and can't be misused.
export function googleMapsEmbedUrl(placeId: string): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ key, q: `place_id:${placeId}` });
  return `https://www.google.com/maps/embed/v1/place?${params}`;
}
