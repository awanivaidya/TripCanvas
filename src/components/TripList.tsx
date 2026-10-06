// The "/trips" page as it is drawn: the header, the heading and one photo tile per trip.
// It only draws what it is given (plain props, no database, no sign-in), so the page file
// (app/trips/page.tsx) does the loading and this file does the looks. A server component.
import Link from "next/link";
import { ArrowRight, CalendarDays, Compass, MapPin, Plus } from "lucide-react";
import { countTripDays, formatDay } from "@/lib/dates";
import { accentVariables, type PhotoAccent } from "@/lib/photoAccent";
import { AppHeader } from "@/components/AppHeader";
import { buttonClass } from "@/components/ui/button";

export type TripListItem = {
  id: string;
  title: string;
  destination: string;
  startDate: string; // "2026-11-05"
  endDate: string;
  photoUrl: string | null; // null = no photo was found: the tile shows the accent color instead
};

type Props = {
  firstName?: string;
  trips: TripListItem[]; // in the order to show them (the page sends newest first)
  user: { name?: string | null; image?: string | null }; // for the header
  accent: PhotoAccent | null; // null = our usual sage
};

export function TripList({ firstName, trips, user, accent }: Props) {
  return (
    // photo-accent + the --accent-* variables: every clay-* color in here (the button, the glow, the
    // eyebrow text) takes the photo's color, and paper/sand-* its soft tint. See globals.css.
    // bg-paper + min-h-screen: <body> is painted with the UNTINTED paper (it sits outside this div),
    // so this div has to paint the tinted paper itself, over the whole screen.
    <div
      className={`min-h-screen bg-paper ${accent ? "photo-accent" : ""}`}
      style={accent ? (accentVariables(accent) as React.CSSProperties) : undefined}
    >
      <AppHeader user={user} />
      {/* relative: the glow below is placed against this box (its top edge, full width). */}
      <div className="relative">
        {/* A soft glow behind the heading: the lightest accent shade fading out into the paper.
            clay-50 is a pale tint in light mode and a deep one in dark mode, so it stays subtle in both. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-clay-50 to-transparent"
        />
        <main className="relative mx-auto max-w-6xl px-6 py-12">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="animate-fade-up">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-600">
                {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
              </p>
              <h1 className="mt-2 text-4xl sm:text-5xl">Your trips</h1>
            </div>
            <Link href="/trips/new" className={buttonClass("primary", "lg")}>
              <Plus className="h-5 w-5" />
              Plan a new trip
            </Link>
          </div>

          {trips.length === 0 ? (
            <div className="flex animate-fade-up flex-col items-center rounded-3xl border border-dashed border-sand-300 bg-surface/60 px-6 py-20 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-clay-50 text-clay-600">
                <Compass className="h-7 w-7" strokeWidth={1.5} />
              </span>
              <h2 className="mt-5 text-2xl">No trips yet</h2>
              <p className="mt-2 max-w-sm text-ink-soft">
                Tell us where you&rsquo;d like to go, or just the kind of trip you&rsquo;re in the mood for.
              </p>
              <Link href="/trips/new" className={`${buttonClass("primary", "md")} mt-6`}>
                Start planning
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip, i) => {
                const days = countTripDays(trip.startDate, trip.endDate);
                return (
                  <li key={trip.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                    {/* The whole tile is the photo, with the text on top of it.
                        bg-clay-600: what you see with no photo (or while it loads). White text is
                        only safe on a photo or on clay-600, so the fallback has to be that shade. */}
                    <Link
                      href={`/trips/${trip.id}`}
                      className="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-clay-600 shadow-sm ring-1 ring-sand-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                    >
                      {trip.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trip.photoUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      )}
                      <span className="absolute left-4 top-4 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink backdrop-blur">
                        {days} {days === 1 ? "day" : "days"}
                      </span>
                      {/* Dark gradient rising from the bottom, so white text is readable on any photo.
                          It lives on the text box itself, so a long title gets a taller gradient by
                          itself. via-60%: it stays dark behind the text and only fades out in the
                          empty space above the title (pt-24), even on a snow-white photo. */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-shade/90 via-shade/70 via-60% to-transparent p-5 pt-24">
                        {/* line-clamp: a very long title or destination ends in "…" instead of
                            pushing the text up over the whole photo. */}
                        <h2 className="line-clamp-3 text-xl leading-snug text-white">{trip.title}</h2>
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-white/85">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="line-clamp-2">{trip.destination}</span>
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
                          <CalendarDays className="h-4 w-4 shrink-0" />
                          {formatDay(trip.startDate)} – {formatDay(trip.endDate)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
