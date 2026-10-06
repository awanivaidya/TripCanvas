// Small text helpers about who's travelling and how. Kept in their own file (no database imports),
// so both server code (prompts) and browser components (the chat, the header) can use them.
import type { TransportMode } from "@/lib/schemas";

// (2, 1) -> "2 adults, 1 child"
export function describeTravelers(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "child" : "children"}`);
  return parts.join(", ");
}

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  flight: "Flight",
  train: "Train",
  road: "Road (bus or cab)",
};

// ["train", "road"] -> "train, road (bus or cab)"; [] -> "no preference"
export function describeTransport(modes: readonly string[]): string {
  if (modes.length === 0) return "no preference";
  return modes.map((m) => TRANSPORT_LABELS[m as TransportMode]?.toLowerCase() ?? m).join(", ");
}
