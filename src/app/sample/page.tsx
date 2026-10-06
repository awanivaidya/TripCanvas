// "/sample": a finished trip anyone can open, without signing in. It's the real board (drag cards,
// edit them, undo), filled with a hand-written itinerary (lib/sampleTrip.ts) instead of one from the
// database. Nothing is saved and no AI is called, so it always works, even when the free AI plan's
// daily limit is used up.
import Link from "next/link";
import { ArrowLeft, CalendarDays, Camera, Info, MapPin, Sparkles, Users } from "lucide-react";
import { signIn } from "@/auth";
import { formatDay } from "@/lib/dates";
import { findPlacePhoto } from "@/lib/placePhoto";
import { accentVariables, photoAccent } from "@/lib/photoAccent";
import { describeTravelers } from "@/lib/travelers";
import { SAMPLE_CHAT, SAMPLE_TRAVEL, SAMPLE_TRIP, sampleBoardDays } from "@/lib/sampleTrip";
import { TripTabs } from "@/components/TripTabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonClass } from "@/components/ui/button";

// The page is the same for everyone, so Next.js builds it once and rebuilds it at most once a day
// (that's when the destination photo is looked up again), instead of on every visit.
export const revalidate = 86400;

export const metadata = { title: "Sample trip · TripCanvas" };

export default async function SamplePage() {
  const photo = await findPlacePhoto(SAMPLE_TRIP.destination);
  const accent = photo ? await photoAccent(photo.imageUrl) : null;

  return (
    <div
      className={`flex h-screen flex-col ${accent ? "photo-accent" : ""}`}
      style={accent ? (accentVariables(accent) as React.CSSProperties) : undefined}
    >
      <header className="flex items-center justify-between gap-4 border-b border-sand-200 bg-paper px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            aria-label="Back to the home page"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sand-300 bg-surface text-ink-soft transition hover:border-clay-500 hover:text-clay-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-tight">{SAMPLE_TRIP.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-clay-600" />
                {SAMPLE_TRIP.destination}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-ink-faint" />
                {formatDay(SAMPLE_TRIP.startDate)} – {formatDay(SAMPLE_TRIP.endDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-ink-faint" />
                {describeTravelers(SAMPLE_TRIP.adults, SAMPLE_TRIP.children)} from New Delhi
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/trips/new" });
            }}
          >
            <button type="submit" className={buttonClass("primary", "md")}>
              <Sparkles className="h-4 w-4" />
              Plan your own
            </button>
          </form>
        </div>
      </header>

      {/* Say plainly what this page is, so nobody mistakes it for their own trip. */}
      <div className="flex items-start gap-2 border-b border-sand-200 bg-clay-50 px-6 py-2 text-sm text-ink-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-clay-600" />
        <p>
          <span className="font-medium text-ink">A sample trip, planned in advance</span> to show what TripCanvas makes.
          Drag cards between days, open one to edit it, and use Undo: nothing is saved. Your own trips are planned by
          AI from a short chat.
        </p>
      </div>

      <main
        className="relative min-h-0 flex-1 bg-gradient-to-br from-sage-50 to-sand-200 bg-cover bg-center"
        style={photo ? { backgroundImage: `url(${JSON.stringify(photo.imageUrl)})` } : undefined}
      >
        <TripTabs
          tripId="sample"
          destination={SAMPLE_TRIP.destination}
          currency={SAMPLE_TRIP.currency}
          travelers={{ adults: SAMPLE_TRIP.adults, children: SAMPLE_TRIP.children }}
          initialDays={sampleBoardDays()}
          initialMessages={SAMPLE_CHAT}
          sample
          sampleTravel={SAMPLE_TRAVEL}
        />
        {photo && (
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
