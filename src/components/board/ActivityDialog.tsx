"use client";
// A popup for editing (or adding) one activity.
// It edits a *copy* of the activity in local state. Nothing changes on the board until you click
// Save, so Cancel simply throws the copy away.
import { useState } from "react";
import { CATEGORIES, type BoardActivity } from "@/lib/schemas";
import { checkTimeAgainstHours, hasFixedHours } from "@/lib/openHours";
import { withStartTime } from "@/lib/feasibility";
import { Clock, Trash2, TriangleAlert, X } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/button";
import { CATEGORY_STYLES, iconForActivity } from "./categories";

type Props = {
  activity: BoardActivity;
  isNew: boolean;
  onSave: (activity: BoardActivity) => void;
  onDelete: () => void;
  onClose: () => void;
};

// Small uppercase labels above each field, like a printed form.
const labelClass = "block space-y-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint";

export function ActivityDialog({ activity, isNew, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(activity);
  // Set only when the CURRENT startTime in the draft is outside the place's opening hours.
  // We check live (on every time change) rather than only on submit, so the user sees the
  // problem immediately instead of after clicking Save.
  const [timeError, setTimeError] = useState<string | null>(null);

  // A helper to update one field: set("title", "Ramen") -> { ...draft, title: "Ramen" }
  function set<K extends keyof BoardActivity>(key: K, value: BoardActivity[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Empty text fields are stored as null ("no value"), not "".
  const orNull = (value: string) => (value.trim() === "" ? null : value);

  function handleStartTimeChange(rawValue: string) {
    const time = orNull(rawValue);
    // withStartTime also moves a leg's arrival time by the same amount.
    setDraft((d) => withStartTime(d, time));
    // checkTimeAgainstHours returns null when the time is fine (or there's no constraint).
    setTimeError(checkTimeAgainstHours(draft, time));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Re-check right before saving too — belt and suspenders in case something else changed
    // durationMin (which also affects whether the activity still fits before closing time).
    const error = checkTimeAgainstHours(draft, draft.startTime);
    if (error) {
      setTimeError(error);
      return; // blocked: no onSave call, so nothing reaches the server
    }
    // A renamed or moved place may be a different place, so its saved Google Maps place no longer fits.
    const samePlace = draft.title.trim() === activity.title && draft.locationName === activity.locationName;
    onSave({
      ...draft,
      title: draft.title.trim(),
      // Only transport has an arrival time (in case the type was changed from transport to something else).
      arrivalTime: draft.category === "transport" ? draft.arrivalTime : null,
      googlePlaceId: samePlace ? draft.googlePlaceId : null,
      // ...and so is where it was on the map.
      lat: samePlace ? draft.lat : null,
      lng: samePlace ? draft.lng : null,
    });
  }

  const HeaderIcon = iconForActivity(draft);

  return (
    // The dark overlay. Clicking it closes the dialog; clicks inside the box don't (stopPropagation).
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-shade/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg animate-scale-in space-y-5 rounded-3xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${CATEGORY_STYLES[draft.category].chip}`}>
              <HeaderIcon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h2 className="text-2xl">{isNew ? "Add activity" : "Edit activity"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-faint transition hover:bg-sand-100 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className={labelClass}>
          <span>Title</span>
          <input
            required
            autoFocus
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Sunset at Chandrabhaga Beach"
            className={`${inputClass} text-base normal-case tracking-normal`}
          />
        </label>

        {hasFixedHours(draft) && (
          <p className="-mt-3 inline-flex items-center gap-1.5 text-xs text-ink-faint">
            <Clock className="h-3.5 w-3.5" />
            Open {draft.openTime}–{draft.closeTime}
          </p>
        )}

        {/* Category: a row of icon buttons instead of a dropdown, so you can see every option. */}
        <div className={labelClass}>
          <span>Type</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const { icon: Icon, label } = CATEGORY_STYLES[c];
              const selected = draft.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("category", c)}
                  aria-pressed={selected}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm normal-case tracking-normal transition ${
                    selected
                      ? "border-clay-600 bg-clay-600 text-white"
                      : "border-sand-200 text-ink-soft hover:border-clay-500 hover:text-clay-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span>Start time</span>
            <input
              type="time"
              value={draft.startTime ?? ""}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className={`${inputClass} ${timeError ? "border-danger-500 focus:border-danger-500 focus:ring-danger-100" : ""}`}
            />
          </label>
          <label className={labelClass}>
            <span>Duration (minutes)</span>
            <input
              type="number"
              min={5}
              step={5}
              value={draft.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        {draft.category === "transport" && (
          <label className={labelClass}>
            <span>Arrives (local time at arrival)</span>
            <input
              type="time"
              value={draft.arrivalTime ?? ""}
              onChange={(e) => set("arrivalTime", orNull(e.target.value))}
              className={inputClass}
            />
          </label>
        )}

        {timeError && (
          <p className="flex items-start gap-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {timeError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span>Location</span>
            <input
              value={draft.locationName ?? ""}
              onChange={(e) => set("locationName", orNull(e.target.value))}
              placeholder="Area, city"
              className={`${inputClass} normal-case tracking-normal`}
            />
          </label>
          <label className={labelClass}>
            <span>Estimated cost</span>
            <input
              value={draft.estCost ?? ""}
              onChange={(e) => set("estCost", orNull(e.target.value))}
              placeholder="e.g. ~₹500"
              className={`${inputClass} normal-case tracking-normal`}
            />
          </label>
        </div>
        <label className={labelClass}>
          <span>Notes</span>
          <textarea
            rows={3}
            value={draft.description ?? ""}
            onChange={(e) => set("description", orNull(e.target.value))}
            placeholder="Anything to remember"
            className={`${inputClass} resize-none normal-case tracking-normal`}
          />
        </label>

        <div className="flex items-center justify-between border-t border-sand-100 pt-4">
          {!isNew ? (
            <button type="button" onClick={onDelete} className={`${buttonClass("ghost", "sm")} hover:bg-danger-50 hover:text-danger-700`}>
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
              Cancel
            </button>
            <button type="submit" disabled={Boolean(timeError)} className={buttonClass("primary", "md")}>
              {isNew ? "Add to day" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
