// The TripCanvas wordmark: a compass in a sage circle + the name in the serif font.
// `onPhoto` switches to white text for use on top of a photo (the landing page hero).
import Link from "next/link";
import { Compass } from "lucide-react";

export function Logo({ href = "/trips", onPhoto = false }: { href?: string; onPhoto?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-600 text-white shadow-sm transition-transform duration-500 group-hover:rotate-45">
        <Compass className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className={`font-display text-xl font-semibold ${onPhoto ? "text-white" : "text-ink"}`}>TripCanvas</span>
    </Link>
  );
}
