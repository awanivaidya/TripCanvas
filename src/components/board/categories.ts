// How each activity category looks on the board: an icon (from lucide-react) in a soft
// colored circle. Muted, earthy colors, so the photo behind the board stays the star.
import {
  BedDouble,
  Bus,
  CarTaxiFront,
  Coffee,
  Landmark,
  Plane,
  Ship,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { BoardActivity } from "@/lib/schemas";

type Category = BoardActivity["category"];

export const CATEGORY_STYLES: Record<Category, { icon: LucideIcon; label: string; chip: string }> = {
  sight: { icon: Landmark, label: "Sight", chip: "bg-sky-50 text-sky-700" },
  food: { icon: UtensilsCrossed, label: "Food", chip: "bg-clay-50 text-clay-700" },
  transport: { icon: TrainFront, label: "Transport", chip: "bg-sand-100 text-ink-soft" },
  lodging: { icon: BedDouble, label: "Stay", chip: "bg-plum-50 text-plum-700" },
  activity: { icon: Ticket, label: "Activity", chip: "bg-sage-50 text-sage-600" },
  free: { icon: Coffee, label: "Free time", chip: "bg-ochre-50 text-ochre-700" },
};

// Transport cards say what they are in their title ("Flight: Guwahati → ...", "Shared cab: ..."),
// so we can show the right vehicle instead of a train for everything.
export function iconForActivity(activity: Pick<BoardActivity, "category" | "title">): LucideIcon {
  if (activity.category !== "transport") return CATEGORY_STYLES[activity.category].icon;
  const title = activity.title.toLowerCase();
  if (title.includes("flight") || title.includes("fly")) return Plane;
  if (title.includes("bus")) return Bus;
  if (title.includes("cab") || title.includes("taxi") || title.includes("car")) return CarTaxiFront;
  if (title.includes("ferry") || title.includes("boat")) return Ship;
  return TrainFront;
}

// 90 -> "1h 30m"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Cards at one specific real place: the planner found it on Google Maps and saved its id. Others
// (free time, "explore the old town", cards added by hand) open the editor straight away. Transport
// cards have a place too (where they arrive, for the location check in geo.ts), but a station's
// page isn't what you want when you click a train, so they open the editor as well.
export function hasGooglePlace(activity: Pick<BoardActivity, "googlePlaceId" | "category">): boolean {
  return Boolean(activity.googlePlaceId) && activity.category !== "transport";
}
