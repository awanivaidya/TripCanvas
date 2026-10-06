"use client";
// One day column: a header plus a sortable list of activity cards.
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { GripHorizontal, Plus } from "lucide-react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardActivity, BoardDay } from "@/lib/schemas";
import { formatDay } from "@/lib/dates";
import { ActivityCard } from "./ActivityCard";

type Props = {
  day: BoardDay;
  problems: Map<string, string>; // card id -> what's wrong with it (see lib/boardCheck.ts)
  onOpenActivity: (activity: BoardActivity) => void;
  onPreviewActivity: (activity: BoardActivity) => void; // the mouse is on a card: start loading its place
  onAddActivity: () => void;
  // Called when the user drags this day's header onto ANOTHER day's header, to swap them.
  onSwapWith: (otherDayId: string) => void;
};

// The custom MIME type we use for the header drag. Using our own type (instead of the
// default "text/plain") means dropping a day header somewhere else on the page (like a
// text field) doesn't accidentally do anything.
const DAY_DRAG_TYPE = "application/x-tripcanvas-day";

export function DayColumn({ day, problems, onOpenActivity, onPreviewActivity, onAddActivity, onSwapWith }: Props) {
  // The column itself is a drop target too. Without this you couldn't drop a card
  // into a day that has no cards left.
  const { setNodeRef, isOver } = useDroppable({ id: day.id });

  // Highlights the header while another day is being dragged over it, so it's clear
  // where a swap would land.
  const [headerDragOver, setHeaderDragOver] = useState(false);

  return (
    // Frosted glass: half-transparent paper plus a blur, so the photo shows through softly while
    // the cards on top stay readable.
    // The columns rise in one after another (animationDelay), like cards being dealt.
    <section
      className="flex w-80 shrink-0 animate-fade-up flex-col rounded-3xl bg-paper/60 shadow-xl shadow-shade/10 ring-1 ring-surface/60 backdrop-blur-xl"
      style={{ animationDelay: `${day.index * 80}ms` }}
    >
      {/* This header uses the plain browser drag-and-drop API (draggable + onDrag*),
          completely separate from dnd-kit (which handles the cards below). Dragging the
          header swaps two days; dragging a card moves that one activity. */}
      <header
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DAY_DRAG_TYPE, day.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DAY_DRAG_TYPE)) {
            e.preventDefault(); // required to allow a drop
            setHeaderDragOver(true);
          }
        }}
        onDragLeave={() => setHeaderDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHeaderDragOver(false);
          const draggedDayId = e.dataTransfer.getData(DAY_DRAG_TYPE);
          if (draggedDayId) onSwapWith(draggedDayId);
        }}
        title="Drag onto another day to swap them"
        className={`group cursor-grab rounded-t-3xl px-5 pb-3 pt-4 transition-colors active:cursor-grabbing ${
          headerDragOver ? "bg-clay-50 ring-2 ring-inset ring-clay-500" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay-700">Day {day.index + 1}</p>
          {/* Only shows on hover: a hint that the header is a drag handle. */}
          <GripHorizontal className="h-4 w-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <h2 className="mt-0.5 text-xl text-ink">{formatDay(day.date)}</h2>
      </header>

      {/* SortableContext = "these ids form one reorderable list" */}
      <SortableContext items={day.activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`mx-2 flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto rounded-2xl px-1 pb-2 transition-colors ${
            isOver ? "bg-surface/40" : ""
          }`}
        >
          {day.activities.map((activity, i) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              index={i}
              warning={problems.get(activity.id) ?? null}
              onOpen={() => onOpenActivity(activity)}
              onPreview={() => onPreviewActivity(activity)}
            />
          ))}
          {day.activities.length === 0 && (
            <p className="rounded-2xl border border-dashed border-ink/15 py-8 text-center text-sm text-ink-soft">
              Drop activities here
            </p>
          )}
        </div>
      </SortableContext>

      <button
        onClick={onAddActivity}
        className="m-3 mt-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium text-ink-soft transition hover:bg-surface/70 hover:text-clay-700"
      >
        <Plus className="h-4 w-4" />
        Add activity
      </button>
    </section>
  );
}
