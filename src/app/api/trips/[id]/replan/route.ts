// POST /api/trips/[id]/replan: the Edit trip dialog. New dates, travelers or travel preference
// change the whole plan (a different number of days, a kid-friendly pace, trains instead of
// flights...), so we ask the planner for a fresh itinerary with the new constraints and replace
// the old days. Everything else (destination, interests, budget, currency) stays as it was.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ReplanInputSchema, type TripInput } from "@/lib/schemas";
import { formatDay, listTripDates } from "@/lib/dates";
import { withPlaceIds, daysFromDraft, getTripForUser } from "@/lib/trips";
import { planTrip } from "@/lib/agent/planTrip";
import { FALLBACK_LOCATION, describeLocation, getClientIp, lookupHomeLocation } from "@/lib/geolocation";
import { describeTransport, describeTravelers } from "@/lib/travelers";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = ReplanInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const details = parsed.data;

  // The same request the planner got when the trip was created, with the new details on top.
  const input: TripInput = {
    destination: trip.destination,
    ...details,
    budget: trip.budget ?? undefined,
    interests: trip.interests,
    dietary: trip.dietary ?? undefined,
    notes: trip.notes ?? undefined,
  };

  const home = await lookupHomeLocation(getClientIp(request.headers));
  // A town typed in the dialog, else the trip's saved one, else (older trips) the IP guess.
  const origin =
    details.origin ?? trip.origin ?? (home === FALLBACK_LOCATION ? null : describeLocation(home));
  const currency = trip.currency ?? home.currency.code;

  let draft;
  try {
    // Then find each place on Google Maps (free, and only the ids are kept).
    draft = await withPlaceIds(await planTrip(input, origin, currency));
  } catch (error) {
    console.error("replan failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "The AI couldn't re-plan this trip. Please try again.") },
      { status: 502 },
    );
  }

  const dates = listTripDates(details.startDate, details.endDate);
  const summary = `${formatDay(dates[0])} – ${formatDay(dates[dates.length - 1])}, ${describeTravelers(
    details.adults,
    details.children,
  )}, from ${origin ?? "your home town"}, travelling by ${describeTransport(details.transport)}`;

  // One update does it all, as a single transaction: new details, the old days deleted
  // (their activities go too, thanks to onDelete: Cascade), the new days created, and a
  // note in the chat saying what happened.
  await db.trip.update({
    where: { id: trip.id },
    data: {
      title: draft.title,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      adults: details.adults,
      children: details.children,
      transportModes: details.transport,
      origin,
      days: { deleteMany: {}, create: daysFromDraft(dates, draft) },
      messages: {
        create: { role: "assistant", content: `I re-planned your trip for the new details (${summary}).` },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
