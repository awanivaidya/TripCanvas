// "/trips": the list of your trips, as photo tiles.
// A server component can query the database directly. No API route is needed to *read* data.
// This file only LOADS things (who you are, your trips, their photos, the accent color);
// components/TripList.tsx draws them.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { findPlacePhoto } from "@/lib/placePhoto";
import { photoAccent } from "@/lib/photoAccent";
import { TripList } from "@/components/TripList";

export default async function TripsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const trips = await db.trip.findMany({
    where: { userId: session.user.id }, // only MY trips
    orderBy: { createdAt: "desc" }, // newest first
  });

  // One photo per trip. Promise.all runs the lookups at the same time instead of one by one
  // (and each answer is cached for a day, see placePhoto.ts).
  const photos = await Promise.all(trips.map((trip) => findPlacePhoto(trip.destination)));

  // The page's accent color comes from the photo of the trip you planned last: trips[0], because
  // the list is newest first. Same as on a trip's own page. null (no trips, no photo, or a grey
  // photo) keeps the usual sage.
  const newestPhoto = photos[0];
  const accent = newestPhoto ? await photoAccent(newestPhoto.imageUrl) : null;

  return (
    <TripList
      firstName={session.user.name?.split(" ")[0]}
      user={session.user}
      accent={accent}
      // Plain values only (dates as "2026-11-05" text), so the list is easy to draw from any data.
      trips={trips.map((trip, i) => ({
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate.toISOString().slice(0, 10),
        endDate: trip.endDate.toISOString().slice(0, 10),
        photoUrl: photos[i]?.imageUrl ?? null,
      }))}
    />
  );
}
