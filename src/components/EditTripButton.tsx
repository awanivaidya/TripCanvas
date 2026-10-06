"use client";
// "Edit trip": change the dates, who's going, or how they travel, and get a fresh plan.
// The server re-plans the whole trip (see api/trips/[id]/replan), then router.refresh() reloads the
// trip page's data, and the board shows the new days.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import type { TransportMode } from "@/lib/schemas";
import { MAX_TRIP_DAYS, addDays, countTripDays } from "@/lib/dates";
import { buttonClass, inputClass } from "@/components/ui/button";
import { TransportPicker, TravelerPicker } from "@/components/TripOptions";

type Props = {
  tripId: string;
  startDate: string; // "2026-10-07"
  endDate: string;
  adults: number;
  // Not "children": React reserves that prop name for nested JSX.
  childCount: number;
  transport: TransportMode[];
  origin: string; // "" for older trips that never saved one
};

const labelClass = "text-xs font-medium uppercase tracking-wider text-ink-faint";

export function EditTripButton(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The dialog edits copies; nothing changes until "Re-plan trip".
  const [startDate, setStartDate] = useState(props.startDate);
  const [endDate, setEndDate] = useState(props.endDate);
  const [travelers, setTravelers] = useState({ adults: props.adults, children: props.childCount });
  const [transport, setTransport] = useState(props.transport);
  const [origin, setOrigin] = useState(props.origin);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    // Start from the trip's current details every time the dialog opens.
    setStartDate(props.startDate);
    setEndDate(props.endDate);
    setTravelers({ adults: props.adults, children: props.childCount });
    setTransport(props.transport);
    setOrigin(props.origin);
    setError(null);
    setOpen(true);
  }

  async function replan(event: React.FormEvent) {
    event.preventDefault();
    setPlanning(true);
    setError(null);
    const response = await fetch(`/api/trips/${props.tripId}/replan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // An empty origin is left out: the server then keeps the trip's saved one.
      body: JSON.stringify({ startDate, endDate, ...travelers, transport, origin: origin.trim() || undefined }),
    });
    setPlanning(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Couldn't re-plan the trip.");
      return;
    }
    setOpen(false);
    router.refresh(); // re-run the trip page on the server, with the new days
  }

  return (
    <>
      <button onClick={openDialog} className={buttonClass("secondary", "sm")}>
        <SlidersHorizontal className="h-4 w-4" />
        Edit trip
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-shade/40 p-4 backdrop-blur-sm"
          // Clicking outside closes it, but not while planning (the request is still running).
          onClick={() => !planning && setOpen(false)}
        >
          <form
            onSubmit={replan}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg animate-scale-in space-y-5 overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl">Edit trip</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={planning}
                aria-label="Close"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-faint transition hover:bg-sand-100 hover:text-ink disabled:opacity-30"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className={labelClass}>Dates</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
                <span className="text-sm text-ink-faint">to</span>
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate}
                  // The server allows at most MAX_TRIP_DAYS; the picker stops there too.
                  max={startDate ? addDays(startDate, MAX_TRIP_DAYS - 1) : undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <label className="block space-y-2">
              <span className={labelClass}>Starting from</span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Your town, e.g. Dhing, Assam"
                minLength={2}
                className={inputClass}
              />
            </label>

            <div className="space-y-2">
              <p className={labelClass}>Travelers</p>
              <TravelerPicker value={travelers} onChange={setTravelers} />
            </div>

            <div className="space-y-2">
              <p className={labelClass}>Getting there by (none = no preference)</p>
              <TransportPicker value={transport} onChange={setTransport} />
            </div>

            <p className="rounded-2xl bg-sand-100 p-3 text-sm text-ink-soft">
              The AI will plan the whole trip again for these details. Changes you made to the current
              plan will be replaced.
            </p>

            {error && (
              <p className="flex items-start gap-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-sand-100 pt-4">
              <button type="button" onClick={() => setOpen(false)} disabled={planning} className={buttonClass("ghost", "md")}>
                Cancel
              </button>
              <button type="submit" disabled={planning || !startDate || !endDate} className={buttonClass("primary", "md")}>
                {planning ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {/* Long trips are planned in parts (planTrip.ts), which takes minutes on the free tier. */}
                    Re-planning… ({startDate && endDate && countTripDays(startDate, endDate) > 10 ? "a few minutes" : "10–30s"})
                  </>
                ) : (
                  "Re-plan trip"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
