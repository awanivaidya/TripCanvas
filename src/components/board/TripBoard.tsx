"use client";
// The interactive canvas: day columns with draggable activity cards.
//
// Data flow (it's the same for every change):
//   user drags / edits / deletes  →  compute the new `days` array
//   →  setDays(newDays)  (the screen updates instantly)
//   →  save(newDays)     (PATCH to the server in the background)
// Updating the screen first and saving afterwards is called an *optimistic update*.
// It makes the app feel instant.
//
// Changes that don't make sense (a time clash, a Kyoto temple moved onto a Tokyo day...) are
// checked BEFORE saving. If one fails, the board snaps back and a warning appears in the middle
// of the screen (CenterNotice). Nothing is saved.
//
// Every accepted change goes through `commit`, which also remembers the board as it was, so Undo
// can put it back. That includes AI changes from the chat: the chat only proposes them, and when
// the traveler clicks Apply, the chat hands them to the board (applyChange) like any other change.
// Problems already on the board (from before a check existed) show as warnings on their cards.
import { useImperativeHandle, useMemo, useState } from "react";
import { Check, CircleAlert, Info, LoaderCircle, TriangleAlert, Undo2, Wallet } from "lucide-react";
import { findBoardProblems } from "@/lib/boardCheck";
import { currencySymbol, estimateTotal } from "@/lib/cost";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { BoardActivity, BoardDay } from "@/lib/schemas";
import { findJourneyProblem, settleDay, timeForDrop, withStartTime } from "@/lib/feasibility";
import { findNewPlaceProblem } from "@/lib/geo";
import { DayColumn } from "./DayColumn";
import { ActivityDialog } from "./ActivityDialog";
import { PlaceDialog } from "./PlaceDialog";
import { hasGooglePlace } from "./categories";
import { loadPlace } from "./placeCache";
import { CenterNotice, type Notice } from "./CenterNotice";

// What the board lets its parent (TripTabs) do: apply a change the chat proposed.
export type BoardHandle = { applyChange: (days: BoardDay[]) => void };

type Props = {
  tripId: string;
  currency: string | null;
  travelers: { adults: number; children: number }; // for the per-person hotel share in the estimate
  initialDays: BoardDay[];
  // In React 19 a component can take `ref` as a normal prop. useImperativeHandle below decides
  // what the parent can do through it.
  ref?: React.Ref<BoardHandle>;
  onChange?: () => void; // after every accepted change (the chat uses it to spot outdated proposals)
  // The public sample trip (/sample): everything works on screen, but nothing is saved, and the
  // checks that ask the AI (moving a card to another day, swapping days) are off: visitors aren't
  // signed in, and they shouldn't use up the AI's free daily limit.
  sample?: boolean;
};

// How many changes Undo can go back.
const MAX_UNDO = 20;
type SaveStatus = "saved" | "saving" | "error";
type Editing = { dayId: string; activity: BoardActivity; isNew: boolean };
type Viewing = { activity: BoardActivity; dayDate: string };

export function TripBoard({ tripId, currency, travelers, initialDays, ref, onChange, sample = false }: Props) {
  const [days, setDays] = useState(initialDays);
  // Earlier versions of the board, newest last. Undo takes the last one back off.
  const [history, setHistory] = useState<BoardDay[][]>([]);
  // Every problem on the board, card by card (worked out again only when `days` changes).
  const problems = useMemo(() => findBoardProblems(days), [days]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editing, setEditing] = useState<Editing | null>(null);
  // The card whose Google Maps panel is open (PlaceDialog).
  const [viewing, setViewing] = useState<Viewing | null>(null);
  // A copy of the board from when a drag started, so we can undo it if the drag is cancelled.
  const [beforeDrag, setBeforeDrag] = useState<BoardDay[] | null>(null);
  // The message in the middle of the screen ("Checking…" or "Can't make that change").
  const [notice, setNotice] = useState<Notice | null>(null);

  // Sensors = which inputs can start a drag: mouse/touch (after moving 5px), or the keyboard
  // (focus a card with Tab, press Space, then use the arrow keys).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---------- saving ----------

  async function save(nextDays: BoardDay[]) {
    if (sample) return; // the sample trip isn't in the database
    setSaveStatus("saving");
    const response = await fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: nextDays.map((d) => ({ id: d.id, activities: d.activities })) }),
    });
    setSaveStatus(response.ok ? "saved" : "error");
  }

  // Every accepted change goes through here: remember the old board (for Undo), show the new one,
  // save it (unless the server already did, like a day swap), and tell the parent.
  function commit(previousDays: BoardDay[], nextDays: BoardDay[], alreadySaved = false) {
    setHistory((h) => [...h.slice(-(MAX_UNDO - 1)), previousDays]);
    setDays(nextDays);
    if (!alreadySaved) save(nextDays);
    onChange?.();
  }

  // Show the change right away, then save it.
  function updateBoard(nextDays: BoardDay[]) {
    commit(days, nextDays);
  }

  // Put the board back the way it was before the last change, and save that.
  function undo() {
    const previousDays = history[history.length - 1];
    if (!previousDays) return;
    setHistory((h) => h.slice(0, -1));
    setDays(previousDays);
    save(previousDays);
    onChange?.();
  }

  // The parent's way in: TripTabs calls boardRef.current.applyChange(days) when the traveler
  // clicks Apply on a chat proposal. It's then a normal change: saved, checked, undoable.
  useImperativeHandle(ref, () => ({ applyChange: updateBoard }));

  // Undo a change and explain why, in the middle of the screen.
  function block(previousDays: BoardDay[], reason: string) {
    setDays(previousDays);
    setNotice({ kind: "blocked", text: reason });
  }

  // ---------- drag and drop ----------

  // Which day contains this id? The id is either a day's id (hovering an empty column)
  // or an activity's id (hovering a card).
  function findDayId(id: string): string | undefined {
    if (days.some((d) => d.id === id)) return id;
    return days.find((d) => d.activities.some((a) => a.id === id))?.id;
  }

  // Fires continuously while dragging. When the card crosses into ANOTHER day, we move it
  // there immediately, so that column opens up space for it.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const fromDayId = findDayId(String(active.id));
    const toDayId = findDayId(String(over.id));
    if (!fromDayId || !toDayId || fromDayId === toDayId) return;

    const movingCard = days.find((d) => d.id === fromDayId)!.activities.find((a) => a.id === active.id)!;

    setDays(
      days.map((day) => {
        if (day.id === fromDayId) {
          return { ...day, activities: day.activities.filter((a) => a.id !== active.id) };
        }
        if (day.id === toDayId) {
          // Insert at the hovered card's position, or at the end when hovering the empty column.
          const overIndex = day.activities.findIndex((a) => a.id === over.id);
          const insertAt = overIndex === -1 ? day.activities.length : overIndex;
          const activities = [...day.activities];
          activities.splice(insertAt, 0, movingCard);
          return { ...day, activities };
        }
        return day;
      }),
    );
  }

  // Fires once when the card is dropped. By now it's already in the right day
  // (handleDragOver did that), so we fix its position inside that day, check the move makes
  // sense, and only then save.
  async function handleDragEnd({ active, over }: DragEndEvent) {
    const snapshot = beforeDrag;
    setBeforeDrag(null);
    if (!snapshot) return;

    if (!over) {
      setDays(snapshot); // dropped outside the board: put everything back
      return;
    }

    let nextDays = days;
    const dayId = findDayId(String(active.id));
    if (dayId && dayId === findDayId(String(over.id))) {
      nextDays = days.map((day) => {
        if (day.id !== dayId) return day;
        const oldIndex = day.activities.findIndex((a) => a.id === active.id);
        const newIndex = day.activities.findIndex((a) => a.id === over.id);
        if (newIndex === -1 || oldIndex === newIndex) return day;
        return { ...day, activities: arrayMove(day.activities, oldIndex, newIndex) };
      });
    }

    // Only continue if the drag actually changed something (a tiny wiggle shouldn't hit the server).
    if (JSON.stringify(nextDays) === JSON.stringify(snapshot)) return;

    const cardId = String(active.id);
    const fromDayId = snapshot.find((d) => d.activities.some((a) => a.id === cardId))!.id;
    const toDay = nextDays.find((d) => d.activities.some((a) => a.id === cardId))!;
    const index = toDay.activities.findIndex((a) => a.id === cardId);
    const card = toDay.activities[index];

    // Check 1 (instant): the card takes the time slot where it was dropped, and any card it now
    // overlaps is pushed later (settleDay). Blocked if a pushed card no longer fits the day.
    const movedCard = withStartTime(card, timeForDrop(toDay.activities, index));
    const settled = settleDay(toDay.activities, movedCard);
    if ("problem" in settled) {
      block(snapshot, settled.problem);
      return;
    }
    nextDays = nextDays.map((day) => (day.id === toDay.id ? { ...day, activities: settled.activities } : day));

    // Check 2 (instant): the numbered journey legs (train 1 → flight 2 → cab 3) must stay in order.
    const journeyProblem = findJourneyProblem(nextDays);
    if (journeyProblem) {
      block(snapshot, journeyProblem);
      return;
    }

    // Check 3 (instant): can you get to each place in time (a Jeju café after the flight to Seoul)?
    // Only a problem this drag CREATES counts, compared with the day as it was before.
    const dayBefore = snapshot.find((d) => d.id === toDay.id)!.activities;
    const placeProblem = findNewPlaceProblem(dayBefore, settled.activities);
    if (placeProblem) {
      block(snapshot, placeProblem);
      return;
    }
    setDays(nextDays);

    // Check 3 (AI): moved to a DIFFERENT day? Ask whether that makes sense (same city? not
    // an arrival/check-in tied to its original day?). The overlay also stops other edits meanwhile.
    // (Not in the sample: the instant checks above still ran.)
    if (fromDayId !== toDay.id && !sample) {
      setNotice({ kind: "checking", text: "Checking if that move makes sense…" });
      const response = await fetch(`/api/trips/${tripId}/check-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: cardId, toDayId: toDay.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.allowed) {
        block(snapshot, data.reason ?? data.error ?? "Couldn't check that move.");
        return;
      }
      setNotice(null);
    }

    commit(snapshot, nextDays);
  }

  // ---------- day swapping ----------
  // Separate from dnd-kit entirely: this uses the plain HTML5 drag-and-drop API
  // (the `draggable` attribute + onDragStart/onDrop), triggered only by dragging a day's
  // HEADER (see DayColumn). That keeps it from ever interfering with card dragging above.

  async function swapDays(dayAId: string, dayBId: string) {
    if (dayAId === dayBId) return;
    if (sample) {
      setNotice({
        kind: "blocked",
        text: "Swapping days asks the AI whether the swap makes sense, so it's off in the sample. Sign in to try it on your own trip.",
      });
      return;
    }

    setNotice({ kind: "checking", text: "Checking if that swap makes sense…" });
    const response = await fetch(`/api/trips/${tripId}/swap-days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayAId, dayBId }),
    });
    const data = await response.json();

    if (!response.ok || !data.allowed) {
      // The server made no changes, so the board doesn't need to change either — just explain why.
      setNotice({ kind: "blocked", text: data.reason ?? data.error ?? "Couldn't check that swap." });
      return;
    }

    // The server already applied the swap to the database. Re-fetch this trip's days so the
    // board matches exactly what's saved (simpler and safer than re-computing the swap,
    // including any AI adjustments, ourselves in the browser).
    const tripResponse = await fetch(`/api/trips/${tripId}`);
    if (tripResponse.ok) {
      const trip = await tripResponse.json();
      commit(days, trip.days, true); // the server already saved the swap
    }
    setNotice(null);
  }

  // ---------- opening and editing ----------

  // Clicking a card: a real place (a sight, a restaurant, a hotel...) shows its Google Maps panel
  // first, with an "Edit card" button. Transport legs and free time go straight to the editor.
  function openCard(activity: BoardActivity) {
    if (!hasGooglePlace(activity)) return openEditor(activity);
    const day = days.find((d) => d.activities.some((a) => a.id === activity.id))!;
    setViewing({ activity, dayDate: day.date });
  }

  function openEditor(activity: BoardActivity) {
    setEditing({ dayId: findDayId(activity.id)!, activity, isNew: false });
  }

  function openNewActivity(dayId: string) {
    setEditing({
      dayId,
      isNew: true,
      activity: {
        id: crypto.randomUUID(), // a new unique id, created in the browser
        title: "",
        description: null,
        category: "activity",
        startTime: null,
        durationMin: 60,
        locationName: null,
        estCost: null,
        openTime: null,
        closeTime: null,
        arrivalTime: null,
        googlePlaceId: null, // added by hand: no Google Maps place (yet)
        lat: null,
        lng: null,
        journeyStep: null, // cards added by hand are never part of the numbered journey
      },
    });
  }

  function saveActivity(activity: BoardActivity) {
    if (!editing) return;

    // Re-time the day only when the time could have changed: a new card, or a new start/length.
    // (So fixing a typo in a title is never blocked.)
    const day = days.find((d) => d.id === editing.dayId)!;
    const before = day.activities.find((a) => a.id === activity.id);
    const timeChanged =
      !before ||
      before.startTime !== activity.startTime ||
      before.durationMin !== activity.durationMin ||
      before.arrivalTime !== activity.arrivalTime;

    let activities = editing.isNew
      ? [...day.activities, activity] // add to the end of the day
      : day.activities.map((a) => (a.id === activity.id ? activity : a)); // replace the edited one
    if (timeChanged) {
      // The edited card keeps its new time; cards it now overlaps are pushed later,
      // and the day is re-sorted by time.
      const settled = settleDay(activities, activity);
      if ("problem" in settled) {
        // Not saved. The dialog stays open underneath, so the user can fix the time.
        setNotice({ kind: "blocked", text: settled.problem });
        return;
      }
      activities = settled.activities;
    }

    const nextDays = days.map((d) => (d.id === editing.dayId ? { ...d, activities } : d));
    // A new time can also put a journey leg before an earlier one (e.g. the flight before the train).
    const journeyProblem = findJourneyProblem(nextDays);
    if (journeyProblem) {
      setNotice({ kind: "blocked", text: journeyProblem });
      return;
    }
    // ...or put a place where you can't get to in time (only problems this edit creates count).
    const placeProblem = findNewPlaceProblem(day.activities, activities);
    if (placeProblem) {
      setNotice({ kind: "blocked", text: placeProblem });
      return;
    }
    updateBoard(nextDays);
    setEditing(null);
  }

  function deleteActivity(activityId: string) {
    updateBoard(days.map((day) => ({ ...day, activities: day.activities.filter((a) => a.id !== activityId) })));
    setEditing(null);
  }

  // ---------- render ----------

  return (
    <div className="relative h-full">
      {/* A small solid pill, so the text is readable on top of the background photo */}
      {/* Top right: the estimated cost (worked out from `days` on every render, so it updates the
          moment a card is edited, added, deleted, or changed by the chat) and the save status. */}
      <div className="absolute right-6 top-3 z-10 flex items-center gap-2">
        {/* How many cards have a problem (each one shows its own warning). */}
        {problems.size > 0 && (
          <div
            title="Cards with a red note have a problem: a clash, too little time before a flight, a place you can't reach in time..."
            className="flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1 text-xs font-semibold text-danger-700 shadow-sm"
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            {problems.size} {problems.size === 1 ? "issue" : "issues"}
          </div>
        )}
        <div
          title="The sum of the cost estimates on all cards, per person. Hotels count every night, shared by the people in each room."
          className="flex items-center gap-2 rounded-full bg-surface/95 py-1 pl-2 pr-3.5 shadow-sm backdrop-blur"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay-50 text-clay-600">
            <Wallet className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs text-ink-faint">Est.</span>
          <span className="font-display text-base font-semibold tabular-nums text-ink">
            {currencySymbol(currency, days)}
            {estimateTotal(days, travelers).toLocaleString("en-IN")}
          </span>
          <span className="text-xs text-ink-faint">/ person</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
          {sample && (
            <span className="inline-flex items-center gap-1.5 text-ink-soft">
              <Info className="h-3.5 w-3.5" /> Sample: changes aren&rsquo;t saved
            </span>
          )}
          {!sample && saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1.5 text-ink-soft">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          {!sample && saveStatus === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-sage-600">
              <Check className="h-3.5 w-3.5" /> All changes saved
            </span>
          )}
          {!sample && saveStatus === "error" && (
            <span className="inline-flex items-center gap-1.5 text-danger-700">
              <CircleAlert className="h-3.5 w-3.5" /> Couldn&rsquo;t save. Try again
            </span>
          )}
        </div>
        {/* Undo the last change: a drag, an edit, a deletion, a day swap or an applied chat change. */}
        <button
          onClick={undo}
          disabled={history.length === 0}
          title="Undo the last change"
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft shadow-sm backdrop-blur transition hover:text-clay-700 disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-soft"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </button>
      </div>

      {/* DndContext is the "drag-and-drop zone". Everything draggable must be inside it.
          The fixed `id` keeps dnd-kit's generated ids the same on server and browser. */}
      <DndContext
        id="trip-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={() => setBeforeDrag(days)}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => beforeDrag && setDays(beforeDrag)}
      >
        <div className="flex h-full gap-5 overflow-x-auto p-6 pt-12">
          {days.map((day) => (
            <DayColumn
              key={day.id}
              day={day}
              problems={problems}
              onOpenActivity={openCard}
              // Start loading the Google Maps details while the mouse is on the card.
              // (Not in the sample: there, every hover would be a paid Google call for an anonymous visitor.
              // The panel loads its place when a card is clicked instead.)
              onPreviewActivity={(activity) => !sample && hasGooglePlace(activity) && loadPlace(tripId, activity)}
              onAddActivity={() => openNewActivity(day.id)}
              onSwapWith={(otherDayId) => swapDays(otherDayId, day.id)}
            />
          ))}
        </div>
      </DndContext>

      {editing && (
        <ActivityDialog
          // key: a new dialog instance per activity, so its local state starts fresh
          key={editing.activity.id}
          activity={editing.activity}
          isNew={editing.isNew}
          onSave={saveActivity}
          onDelete={() => deleteActivity(editing.activity.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {viewing && (
        <PlaceDialog
          key={viewing.activity.id}
          tripId={tripId}
          activity={viewing.activity}
          dayDate={viewing.dayDate}
          onEdit={() => {
            setViewing(null);
            openEditor(viewing.activity);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      {notice && <CenterNotice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
