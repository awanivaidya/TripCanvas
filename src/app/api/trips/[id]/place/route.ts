// GET /api/trips/[id]/place?activityId=...: the real Google Maps place behind one card (photo,
// rating, opening hours, website, map link). The board calls it when the mouse is on a card, so
// it's usually loaded by the time the card is clicked.
// It loads the place by the id saved when the trip was planned (never by searching the card's text,
// which found "Prince breakfast, Myeongdong" for "Breakfast at hotel").
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTripForUser } from "@/lib/trips";
import { getPlaceDetails } from "@/lib/googlePlaces";
import { getClientIp } from "@/lib/geolocation";
import { sampleBoardDays } from "@/lib/sampleTrip";

type Context = { params: Promise<{ id: string }> };

// The public sample trip (/sample) has no owner, so anyone may open its places, without signing
// in. Each lookup is a paid Google call, so two limits: only the sample's own cards (never any
// place id from the URL), and at most this many lookups per visitor (IP address) per hour.
// Kept in memory: it resets when the server restarts, which is fine for a small guard like this.
const SAMPLE_LOOKUPS_PER_HOUR = 30;
const sampleLookups = new Map<string, { count: number; since: number }>();

function allowSampleLookup(ip: string): boolean {
  const now = Date.now();
  const entry = sampleLookups.get(ip);
  if (!entry || now - entry.since > 60 * 60 * 1000) {
    sampleLookups.set(ip, { count: 1, since: now });
    return true;
  }
  entry.count++;
  return entry.count <= SAMPLE_LOOKUPS_PER_HOUR;
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  // A GET has no body, so the card's id comes in the URL: ?activityId=...
  const activityId = new URL(request.url).searchParams.get("activityId");
  if (!activityId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (id === "sample") {
    const card = sampleBoardDays().flatMap((d) => d.activities).find((a) => a.id === activityId);
    if (!card) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    if (!card.googlePlaceId) return NextResponse.json({ place: null });
    if (!allowSampleLookup(getClientIp(request.headers) ?? "unknown")) {
      return NextResponse.json({ error: "That's a lot of places for one hour. Sign in to plan your own trip!" }, { status: 429 });
    }
    return lookUp(card.googlePlaceId);
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Only look in THIS trip's cards (the ownership check covers the activity too).
  const activity = trip.days.flatMap((d) => d.activities).find((a) => a.id === activityId);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  if (!activity.googlePlaceId) return NextResponse.json({ place: null }); // not one specific place
  return lookUp(activity.googlePlaceId);
}

async function lookUp(googlePlaceId: string) {
  try {
    const place = await getPlaceDetails(googlePlaceId);
    return NextResponse.json({ place });
  } catch (error) {
    console.error("Google Places lookup failed:", error);
    return NextResponse.json({ error: "Couldn't reach Google Maps." }, { status: 502 });
  }
}
