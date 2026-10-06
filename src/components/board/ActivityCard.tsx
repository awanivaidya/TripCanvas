"use client";
// One draggable activity card.
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, ExternalLink, Globe, Hourglass, MapPin, TriangleAlert, Wallet } from "lucide-react";
import type { BoardActivity } from "@/lib/schemas";
import { hasFixedHours } from "@/lib/openHours";
import { timeZoneShift } from "@/lib/feasibility";
import { hotelBookingUrl } from "@/lib/booking";
import { CATEGORY_STYLES, formatDuration, iconForActivity } from "./categories";

// `index` = position in its day, used to stagger the fade-in (each card appears a moment later).
// `onPreview`: the mouse (or keyboard focus) is on the card, so it may be opened soon.
// `warning`: what's wrong with this card, if anything (a clash, a place you can't reach in time...).
type Props = {
  activity: BoardActivity;
  index: number;
  warning: string | null;
  onOpen: () => void;
  onPreview: () => void;
};

export function ActivityCard({ activity, index, warning, onOpen, onPreview }: Props) {
  // useSortable wires this element into dnd-kit. It gives us:
  //   setNodeRef:            attach to the DOM element that moves
  //   attributes, listeners: accessibility attributes + the mouse/touch/keyboard handlers
  //   transform, transition: where the card should be drawn *while dragging*
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });

  const style = CATEGORY_STYLES[activity.category];
  const Icon = iconForActivity(activity);
  const shift = timeZoneShift(activity); // minutes the clocks change on this leg (0 = none)

  return (
    <div
      ref={setNodeRef}
      // The fade-in only animates opacity. dnd-kit moves the card with an inline `transform`, and
      // an animation that touched `transform` would override it and break dragging.
      style={{ transform: CSS.Transform.toString(transform), transition, animationDelay: `${index * 50}ms` }}
      {...attributes}
      {...listeners}
      // A click (without dragging) opens the card (TripBoard decides: the Google Maps panel or the
      // editor). The PointerSensor only starts a drag after the mouse moves 5px, so clicks and drags
      // don't get mixed up.
      onClick={onOpen}
      onPointerEnter={onPreview}
      onFocus={onPreview}
      // bg-surface/85 + a blur of the photo behind it: softer than a solid card, still easy to read.
      className={`group animate-fade-in cursor-grab touch-none rounded-2xl bg-surface/85 p-3.5 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
        warning ? "ring-2 ring-danger-500/50" : "ring-1 ring-ink/5 hover:ring-clay-500/30"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.chip}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          {/* The journey from home and back is numbered 1 → 2 → 3..., so its order is easy to see. */}
          {activity.journeyStep !== null && (
            <span
              title={`Step ${activity.journeyStep} of your journey`}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-paper ring-2 ring-surface"
            >
              {activity.journeyStep}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-snug text-ink">{activity.title}</p>
            {activity.startTime && (
              <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
                {activity.startTime}
                {/* A leg shows when it lands too, in local time: "14:30 → 20:30". */}
                {activity.arrivalTime && ` → ${activity.arrivalTime}`}
              </span>
            )}
          </div>
          {activity.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{activity.description}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 pl-12 text-xs text-ink-faint">
        {activity.locationName && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activity.locationName}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Hourglass className="h-3.5 w-3.5" />
          {formatDuration(activity.durationMin)}
        </span>
        {activity.estCost && (
          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />
            {activity.estCost}
          </span>
        )}
        {hasFixedHours(activity) && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Open {activity.openTime}–{activity.closeTime}
          </span>
        )}
      </div>

      {/* A problem with this card, in plain words, right where you'd fix it. */}
      {warning && (
        <p className="ml-12 mt-2 flex items-start gap-1.5 rounded-xl bg-danger-50 px-2.5 py-1.5 text-xs leading-snug text-danger-700">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      )}

      {/* Crossing time zones is easy to miss, and it changes what "20:30" means: say it plainly. */}
      {shift !== 0 && (
        <p className="ml-12 mt-2 inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-2.5 py-0.5 text-xs font-medium text-clay-700">
          <Globe className="h-3.5 w-3.5" />
          Time zone change: clocks go {shift > 0 ? "forward" : "back"} {formatDuration(Math.abs(shift))}
        </p>
      )}

      {activity.category === "lodging" && (
        <a
          href={hotelBookingUrl(activity.title, activity.locationName)}
          target="_blank" // open in a new tab, so the trip stays open
          rel="noopener noreferrer" // standard safety for links that open a new tab
          // The whole card is draggable and clickable. Stop those events here, so clicking (or
          // pressing Enter on) the link opens Booking.com instead of starting a drag or opening the card.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="ml-12 mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-3 py-1 text-xs font-medium text-clay-700 transition hover:bg-clay-600 hover:text-white"
        >
          Book on Booking.com
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
