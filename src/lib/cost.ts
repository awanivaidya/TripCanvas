// The trip's estimated cost, added up from the cards' estCost text ("~₹450", "free", "₹200–300").
// The AI writes each card's cost; the SUM is always done here in code (LLMs are bad at adding up).
import type { BoardDay } from "@/lib/schemas";
import { currencyForCode } from "@/lib/currency";

// "~₹1,200" -> 1200 · "free" -> 0 · "₹200–300" -> 250 (the middle of a range) · "₹2k" -> 2000
// Returns null when there's no number in it at all ("varies").
export function parseCost(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes("free")) return 0;

  // Remove thousands separators first, so "1,200" is read as one number, not "1" and "200".
  const numbers = [...lower.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k\b)?/g)].map(
    (match) => Number(match[1]) * (match[2] ? 1000 : 1),
  );
  if (numbers.length === 0) return null;
  if (numbers.length >= 2 && /[-–]|to/.test(lower)) return (numbers[0] + numbers[1]) / 2;
  return numbers[0];
}

// The per-person total of every card on the board.
// Hotels are different: the planner prices them per ROOM per NIGHT, and there's only one card per
// stay (the check-in). So a hotel counts once for every night until the next hotel (or the last
// day), shared by the people in its rooms (2 adults per room; children stay with them). Before,
// a 2-night stay was added once, at the whole room's price.
export function estimateTotal(days: BoardDay[], travelers: { adults: number; children: number }): number {
  const inOrder = [...days].sort((a, b) => a.index - b.index);
  const people = Math.max(1, travelers.adults + travelers.children);
  const rooms = Math.max(1, Math.ceil(travelers.adults / 2));
  // The days (positions in the trip) on which a hotel stay starts.
  const stayStarts = inOrder.flatMap((day, i) => (day.activities.some((a) => a.category === "lodging") ? [i] : []));

  let total = 0;
  inOrder.forEach((day, i) => {
    for (const activity of day.activities) {
      const cost = activity.estCost ? parseCost(activity.estCost) : null;
      if (cost === null) continue;
      if (activity.category !== "lodging") {
        total += cost;
        continue;
      }
      // Nights = days until the next stay starts (or until the last day, the journey home).
      const nextStay = stayStarts.find((start) => start > i) ?? inOrder.length - 1;
      const nights = Math.max(1, nextStay - i);
      total += (cost * rooms * nights) / people;
    }
  });
  return Math.round(total);
}

// The symbol to show: the trip's currency, or (older trips without one) whatever symbol the
// cards themselves use, e.g. "₹" from "~₹450".
export function currencySymbol(currency: string | null, days: BoardDay[]): string {
  if (currency) return currencyForCode(currency).symbol;
  for (const day of days) {
    for (const activity of day.activities) {
      const symbol = activity.estCost?.match(/[^\d\s~.,\-–]+/)?.[0];
      if (symbol && symbol.toLowerCase() !== "free") return symbol;
    }
  }
  return "";
}
