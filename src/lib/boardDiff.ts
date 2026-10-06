// What a change to the board does, as short lines a person can read before applying it:
//   "Day 2: added Bomnal Café (13:00)"   "Moved Lunch at Dombedon from Day 2 to Day 1"
// Used for the chat's preview ("here's what I'd change: Apply / Discard").
import type { BoardActivity, BoardDay } from "@/lib/schemas";

type Placed = { card: BoardActivity; day: number }; // day = 1-based day number

function cardsById(days: BoardDay[]): Map<string, Placed> {
  return new Map(days.flatMap((d) => d.activities.map((card) => [card.id, { card, day: d.index + 1 }] as const)));
}

const at = (card: BoardActivity) => (card.startTime ? ` (${card.startTime})` : "");

export function describeBoardChanges(before: BoardDay[], after: BoardDay[]): string[] {
  const old = cardsById(before);
  const next = cardsById(after);
  const lines: { day: number; text: string }[] = [];

  for (const [id, { card, day }] of next) {
    const was = old.get(id);
    if (!was) {
      lines.push({ day, text: `Day ${day}: added ${card.title}${at(card)}` });
    } else if (was.day !== day) {
      lines.push({ day, text: `Moved ${card.title} from Day ${was.day} to Day ${day}${at(card)}` });
    } else if (was.card.startTime !== card.startTime) {
      lines.push({ day, text: `Day ${day}: ${card.title} ${was.card.startTime ?? "no time"} → ${card.startTime ?? "no time"}` });
    } else if (was.card.title !== card.title) {
      lines.push({ day, text: `Day ${day}: "${was.card.title}" → "${card.title}"` });
    } else if (JSON.stringify(was.card) !== JSON.stringify(card)) {
      lines.push({ day, text: `Day ${day}: updated ${card.title}` });
    }
  }
  for (const [id, { card, day }] of old) {
    if (!next.has(id)) lines.push({ day, text: `Day ${day}: removed ${card.title}` });
  }

  // In day order, so the list reads through the trip.
  return lines.sort((a, b) => a.day - b.day).map((line) => line.text);
}
