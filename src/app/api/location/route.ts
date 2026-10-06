// GET /api/location: where is the visitor right now? Looked up live from their IP on every call
// (nothing is hard-coded). The chat calls this when it opens, to suggest a home town and
// pre-select their currency. The IP only shows the network's hub city, so it's a guess.
// GET /api/location?lat=..&lng=..: the exact town for coordinates the browser shared ("Use my
// exact location" in the chat).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { FALLBACK_LOCATION, describeLocation, getClientIp, lookupHomeLocation, reverseGeocode } from "@/lib/geolocation";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  // Coordinates from the browser: look up that exact town.
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (url.searchParams.has("lat")) {
    const valid = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const exact = valid ? await reverseGeocode(lat, lng) : null;
    if (!exact) return NextResponse.json({ error: "Couldn't find a town for that location" }, { status: 404 });
    return NextResponse.json({ detected: true, place: describeLocation(exact), countryCode: exact.countryCode, currency: exact.currency });
  }

  const home = await lookupHomeLocation(getClientIp(request.headers));
  // detected: false means the lookup failed and this is only the fallback guess.
  const detected = home !== FALLBACK_LOCATION;
  return NextResponse.json({
    detected,
    place: detected ? describeLocation(home) : null,
    countryCode: detected ? home.countryCode : null, // "IN": lets the chat say "Within India"
    currency: home.currency,
  });
}
