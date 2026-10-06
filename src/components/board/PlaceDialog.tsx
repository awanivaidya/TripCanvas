"use client";
// The popup you see when you click a card: the real place on Google Maps (photo, rating, address,
// opening hours on the day you're going, website, a map), with a button to edit the card.
// It asks our server (/api/trips/[id]/place), which asks Google: the secret key stays on the server.
// The board usually started that request when the mouse moved onto the card (placeCache.ts), so the
// details are often already here when the panel opens.
import { useEffect, useState } from "react";
import { Clock, ExternalLink, Globe, LoaderCircle, MapPin, Pencil, Star, TriangleAlert, X } from "lucide-react";
import type { BoardActivity } from "@/lib/schemas";
import { googleMapsEmbedUrl, googleMapsSearchUrl } from "@/lib/mapsLinks";
import { buttonClass } from "@/components/ui/button";
import { CATEGORY_STYLES, iconForActivity } from "./categories";
import { loadPlace, peekPlace, type PlaceLookup } from "./placeCache";

type Props = {
  tripId: string;
  activity: BoardActivity;
  dayDate: string; // the card's day (ISO date), to show that weekday's opening hours
  onEdit: () => void;
  onClose: () => void;
};

// The four states of the lookup. One variable with a `status` (instead of separate loading/error/
// place variables) means impossible mixes, like "loading AND an error", can't happen.
type Lookup = { status: "loading" } | PlaceLookup;

export function PlaceDialog({ tripId, activity, dayDate, onEdit, onClose }: Props) {
  // Already loaded (the mouse was on the card for a moment)? Then open with it, no spinner.
  const [lookup, setLookup] = useState<Lookup>(() => peekPlace(activity) ?? { status: "loading" });

  useEffect(() => {
    // If the dialog closes before Google answers, `ignore` stops us from updating a closed dialog.
    let ignore = false;
    // Reuses the request the hover already started, if there is one.
    loadPlace(tripId, activity).then((result) => !ignore && setLookup(result));
    return () => {
      ignore = true;
    };
  }, [tripId, activity]);

  const place = lookup.status === "found" ? lookup.place : null;
  // Google lists hours Monday first; JavaScript counts days from Sunday (0). So Monday (1) → 0,
  // ..., Sunday (0) → 6.
  const hoursThatDay = place?.weekdayHours?.[(new Date(dayDate).getUTCDay() + 6) % 7] ?? null;
  const embedUrl = place ? googleMapsEmbedUrl(place.id) : null;
  // When Google found nothing, the button still works: it opens a Google Maps search instead.
  const mapsUrl = place?.mapsUrl ?? googleMapsSearchUrl([activity.title, activity.locationName].filter(Boolean).join(", "));
  const Icon = iconForActivity(activity);

  return (
    // The dark overlay. Clicking it closes the dialog; clicks inside the box don't (stopPropagation).
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-shade/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg animate-scale-in overflow-y-auto rounded-3xl bg-surface shadow-2xl"
      >
        {place?.photoUrl && (
          <div className="relative h-52 bg-sand-100">
            {/* A plain <img> (not next/image), so we don't have to allow Google's photo domain in config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={place.photoUrl} alt={place.name} className="h-full w-full animate-fade-in object-cover" />
            {place.photoAuthor && (
              <a
                href={place.photoAuthor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-2 right-3 text-[11px] text-white/90 drop-shadow hover:underline"
              >
                Photo: {place.photoAuthor.name}
              </a>
            )}
          </div>
        )}

        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CATEGORY_STYLES[activity.category].chip}`}>
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-2xl leading-tight">{activity.title}</h2>
                {activity.startTime && <p className="mt-0.5 text-sm text-ink-faint">Planned at {activity.startTime}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-faint transition hover:bg-sand-100 hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {activity.description && <p className="text-sm leading-relaxed text-ink-soft">{activity.description}</p>}

          {lookup.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Looking it up on Google Maps…
            </p>
          )}

          {(lookup.status === "missing" || lookup.status === "error") && (
            <p className="rounded-2xl bg-sand-50 p-4 text-sm text-ink-soft">
              {lookup.status === "error" ? lookup.message : "Couldn't find this exact place on Google Maps."} You can
              still search for it with the button below.
            </p>
          )}

          {place && (
            <div className="animate-fade-in space-y-3 rounded-2xl bg-sand-50 p-4">
              {/* The exact place saved when the trip was planned (from the AI's placeName). The
                  Google name is shown too, so a mismatch with the card's title is easy to spot. */}
              <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">On Google Maps</p>
              <div>
                <p className="font-medium text-ink">{place.name}</p>
                {place.rating !== null && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
                    <Star className="h-4 w-4 fill-clay-500 text-clay-500" />
                    {place.rating.toFixed(1)}
                    {place.ratingCount !== null && (
                      <span className="text-ink-faint">({place.ratingCount.toLocaleString("en-IN")} reviews)</span>
                    )}
                  </p>
                )}
              </div>
              {place.permanentlyClosed && (
                <p className="flex items-start gap-2 text-sm font-medium text-danger-700">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Google lists this place as permanently closed.
                </p>
              )}
              {place.address && (
                <p className="flex items-start gap-2 text-sm text-ink-soft">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {place.address}
                </p>
              )}
              {hoursThatDay && (
                <p className="flex items-start gap-2 text-sm text-ink-soft">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  {hoursThatDay}
                </p>
              )}
              {place.website && (
                <a
                  href={place.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-clay-700 hover:underline"
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  Official website
                </a>
              )}
            </div>
          )}

          {embedUrl && (
            <iframe
              title={`Map of ${place?.name}`}
              src={embedUrl}
              loading="lazy"
              // Sends our site's address to Google, which checks it against the key's allowed websites.
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="h-56 w-full animate-fade-in rounded-2xl border-0"
            />
          )}

          <div className="flex items-center justify-between border-t border-sand-100 pt-4">
            <button type="button" onClick={onEdit} className={buttonClass("ghost", "md")}>
              <Pencil className="h-4 w-4" />
              Edit card
            </button>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
              Open in Google Maps
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
