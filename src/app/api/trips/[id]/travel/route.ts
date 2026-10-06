// GET /api/trips/[id]/travel: take the trip's saved starting point (or, for older trips, detect it
// from the IP), then ask
// the AI for a few mock door-to-door routes (every train, flight, bus and cab leg) from there to
// the trip's destination.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { getTripForUser } from "@/lib/trips";
import { describeLocation, getClientIp, lookupHomeLocation } from "@/lib/geolocation";
import { currencyForCode } from "@/lib/currency";
import { suggestTravel } from "@/lib/agent/suggestTravel";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const detected = await lookupHomeLocation(getClientIp(request.headers));
  // Prices in the currency picked when the trip was made (older trips: the detected one).
  const home = { ...detected, currency: trip.currency ? currencyForCode(trip.currency) : detected.currency };
  // The starting point saved with the trip. Detecting it again here gave a different town
  // depending on which network you opened the trip from. (Older trips have none saved.)
  const from = trip.origin ?? describeLocation(detected);

  let results;
  try {
    results = await suggestTravel(from, trip.destination, home.currency.code, trip.transportModes);
  } catch (error) {
    console.error("suggestTravel failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "Couldn't look up travel options right now.") },
      { status: 502 },
    );
  }

  return NextResponse.json({ home, from, results });
}
