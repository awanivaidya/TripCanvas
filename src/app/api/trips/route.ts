// POST /api/trips: create a new trip.
// Flow: check login → validate the form → find where the traveler is → ask the AI for an itinerary
// → save it all → return the id.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { TripInputSchema } from "@/lib/schemas";
import { listTripDates } from "@/lib/dates";
import { withPlaceIds, daysFromDraft } from "@/lib/trips";
import { planTrip } from "@/lib/agent/planTrip";
import { FALLBACK_LOCATION, describeLocation, getClientIp, lookupHomeLocation } from "@/lib/geolocation";

export async function POST(request: Request) {
  // 1. Who is calling? No session → 401 Unauthorized.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }

  // 2. Never trust the browser: validate the body. Bad input → 400 Bad Request.
  const parsed = TripInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // 3. Where does the traveler start from? Normally the town they confirmed in the chat. The IP
  //    lookup is still done for the currency, and as a last-resort guess for the town. The AI uses
  //    the town to plan the journey there on day 1 and back home on the last day.
  const home = await lookupHomeLocation(getClientIp(request.headers));
  // The town the user confirmed in the chat wins. The IP guess is only a fallback.
  const origin = input.origin ?? (home === FALLBACK_LOCATION ? null : describeLocation(home));
  // The currency the user picked in the chat wins; otherwise the one from their location.
  const currency = input.currency ?? home.currency.code;

  // 4. Ask the AI agent to plan it. This takes a few seconds.
  let draft;
  try {
    // Then find each place on Google Maps (free, and only the ids are kept).
    draft = await withPlaceIds(await planTrip(input, origin, currency));
  } catch (error) {
    console.error("planTrip failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "The AI couldn't plan this trip. Please try again.") },
      { status: 502 },
    );
  }

  // 5. Save the trip, its days and all activities in ONE query using a *nested create*.
  //    Prisma runs it as a single transaction: either everything is saved, or nothing is.
  const dates = listTripDates(input.startDate, input.endDate);
  const trip = await db.trip.create({
    data: {
      userId: session.user.id,
      title: draft.title,
      // The specific place the AI planned for (e.g. "Puri, Odisha"), not what was typed. If the
      // user's answer was vague, this keeps "Getting there" planning a route to the SAME place.
      destination: draft.destination,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      origin, // saved, so "Getting there" and Edit trip use the same starting point later
      adults: input.adults,
      children: input.children,
      transportModes: input.transport,
      budget: input.budget || null,
      currency,
      // The chat that created this trip, plus a hello, so it carries on in the trip page's chat.
      messages: {
        create: [
          ...(input.transcript ?? []),
          {
            role: "assistant",
            content: "Your trip is ready! Tell me anything you'd like to change, e.g. \"make day 2 more relaxed\".",
          },
        ].map((turn, i) => ({ ...turn, createdAt: new Date(Date.now() + i) })), // +i ms keeps the order
      },
      interests: input.interests,
      dietary: input.dietary || null,
      notes: input.notes || null,
      days: { create: daysFromDraft(dates, draft) }, // shared with the replan route
    },
  });

  // 201 Created. The browser then navigates to /trips/<id>.
  return NextResponse.json({ id: trip.id }, { status: 201 });
}
