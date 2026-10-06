// "/trips/[id]": the trip canvas. The [id] folder makes this a *dynamic route*:
// /trips/abc123 renders this page with params.id = "abc123".
import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, MapPin, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getChatMessages, getTripForUser, refreshLocations, toBoardDays } from "@/lib/trips";
import { formatDay } from "@/lib/dates";
import { findPlacePhoto } from "@/lib/placePhoto";
import { accentVariables, photoAccent } from "@/lib/photoAccent";
import { describeTravelers } from "@/lib/travelers";
import { TripTabs } from "@/components/TripTabs";
import { DeleteTripButton } from "@/components/DeleteTripButton";
import { EditTripButton } from "@/components/EditTripButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { TransportMode } from "@/lib/schemas";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) notFound(); // shows Next.js's 404 page

  // Map coordinates older than Google's 30-day limit (or missing) are fetched again first, so the
  // board's "can you get there in time?" check has them.
  await refreshLocations(trip);

  // Convert database rows into the plain shape the board component expects.
  // (Dates become ISO strings, which are simple to pass from server to browser.)
  const days = toBoardDays(trip);
  // A scenic photo of the destination for the background (null if none was found).
  const photo = await findPlacePhoto(trip.destination);
  // The accent color, from that photo (null: no photo, or a grey one, so the usual sage).
  const accent = photo ? await photoAccent(photo.imageUrl) : null;
  // The saved chat with the AI, shown in the chat panel next to the board.
  const messages = await getChatMessages(trip.id);

  return (
    // photo-accent + the --accent-* variables: every clay-* color on this page (buttons, chips,
    // links, dialogs) takes the photo's color. See globals.css.
    <div
      className={`flex h-screen flex-col ${accent ? "photo-accent" : ""}`}
      style={accent ? (accentVariables(accent) as React.CSSProperties) : undefined}
    >
      <header className="flex items-center justify-between gap-4 border-b border-sand-200 bg-paper px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/trips"
            aria-label="Back to your trips"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sand-300 bg-surface text-ink-soft transition hover:border-clay-500 hover:text-clay-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-tight">{trip.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-clay-600" />
                {trip.destination}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-ink-faint" />
                {formatDay(trip.startDate)} – {formatDay(trip.endDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-ink-faint" />
                {describeTravelers(trip.adults, trip.children)}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <EditTripButton
            tripId={trip.id}
            startDate={trip.startDate.toISOString().slice(0, 10)}
            endDate={trip.endDate.toISOString().slice(0, 10)}
            adults={trip.adults}
            childCount={trip.children}
            transport={trip.transportModes as TransportMode[]}
            origin={trip.origin ?? ""}
          />
          <DeleteTripButton tripId={trip.id} />
        </div>
      </header>

      {/* flex-1 + min-h-0: the tabs fill the remaining height and scroll inside themselves.
          The photo is a CSS background, so the day columns simply sit on top of it.
          Without a photo we fall back to a soft sage-to-sand gradient. */}
      <main
        className="relative min-h-0 flex-1 bg-gradient-to-br from-sage-50 to-sand-200 bg-cover bg-center"
        style={photo ? { backgroundImage: `url(${JSON.stringify(photo.imageUrl)})` } : undefined}
      >
        {/* key: after Edit trip re-plans, updatedAt changes, so React builds fresh tabs (and a
            fresh board) from the new days instead of keeping the old ones in its state. */}
        <TripTabs
          key={trip.updatedAt.getTime()}
          tripId={trip.id}
          destination={trip.destination}
          currency={trip.currency}
          travelers={{ adults: trip.adults, children: trip.children }}
          initialDays={days}
          initialMessages={messages}
        />
        {photo && (
          // Wikipedia photos are free to use, but they ask for credit.
          <a
            href={photo.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-full bg-shade/50 px-3 py-1 text-xs text-white backdrop-blur-sm transition hover:bg-shade/70"
          >
            <Camera className="h-3.5 w-3.5" />
            Photo: Wikipedia
          </a>
        )}
      </main>
    </div>
  );
}
