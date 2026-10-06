"use client";
// The "Getting there" panel: a few complete door-to-door routes from the user's home town to the
// trip's destination, in their home currency. Each route lists every leg (train, flight, bus, cab).
// Fetches once when the panel is first opened (useEffect below), not on every render.
import { useEffect, useState } from "react";
import { ArrowRight, Bus, CarTaxiFront, Info, Plane, Ship, TrainFront, TriangleAlert, type LucideIcon } from "lucide-react";
import type { TravelLeg, TravelOptions } from "@/lib/schemas";

type HomeLocation = { city: string; region: string; countryCode: string; currency: { code: string; symbol: string } };
// What the panel shows: the API's answer, or the sample trip's ready-made routes (lib/sampleTrip.ts).
export type TravelPanelData = { home: HomeLocation; from: string; results: TravelOptions };

const MODE_ICONS: Record<TravelLeg["mode"], LucideIcon> = {
  train: TrainFront,
  flight: Plane,
  bus: Bus,
  cab: CarTaxiFront,
  ferry: Ship,
};

export function TravelPanel({
  tripId,
  destination,
  initialData,
}: {
  tripId: string;
  destination: string;
  initialData?: TravelPanelData; // given = show it, and don't ask the AI (the sample trip)
}) {
  const [data, setData] = useState<TravelPanelData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialData);

  // useEffect with [tripId] runs once when this component first appears on screen:
  // the right place for "go fetch some data".
  useEffect(() => {
    if (initialData) return; // already have it
    let cancelled = false; // guards against setting state after the component is gone

    fetch(`/api/trips/${tripId}/travel`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error ?? "Couldn't load travel options");
        } else {
          setData(body);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load travel options");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tripId, initialData]);

  if (loading) {
    // A "skeleton": grey shapes where the cards will be, gently pulsing. It feels faster than a
    // blank page, because you can already see what's coming.
    return (
      <div className="mx-auto max-w-2xl space-y-5 p-8">
        <p className="text-sm text-ink-soft">Working out how to get there…</p>
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse space-y-4 rounded-3xl bg-surface p-6 ring-1 ring-sand-200">
            <div className="h-5 w-1/2 rounded-full bg-sand-100" />
            <div className="h-4 w-3/4 rounded-full bg-sand-100" />
            <div className="h-4 w-2/3 rounded-full bg-sand-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="flex items-start gap-2 rounded-2xl bg-danger-50 p-4 text-sm text-danger-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error ?? "Something went wrong"}
        </p>
      </div>
    );
  }

  const { home, results } = data;
  const currency = home.currency;
  const money = (amount: number) => `${currency.symbol}${amount.toLocaleString()}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div className="animate-fade-up">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-600">Getting there</p>
        <h2 className="mt-2 flex flex-wrap items-center gap-x-3 text-3xl">
          {data.from.split(",")[0] /* "Dhing, Assam, IN" -> "Dhing" for the heading */}
          <ArrowRight className="h-6 w-6 text-ink-faint" />
          {destination}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">From {data.from} · prices per person in {currency.code}</p>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-sand-100 p-4 text-sm text-ink-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        {results.note}
      </p>

      {results.routes.map((route, i) => {
        // We add up the total ourselves instead of asking the AI for it: code can't get sums wrong.
        const total = route.legs.reduce((sum, leg) => sum + leg.price, 0);
        return (
          <article
            key={i}
            className="animate-fade-up rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-sand-200 transition-shadow hover:shadow-lg"
            style={{ animationDelay: `${(i + 1) * 100}ms` }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl">{route.label}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
                  {route.legs.map((leg, j) => {
                    const Icon = MODE_ICONS[leg.mode];
                    return (
                      <span key={j} className="inline-flex items-center gap-1.5">
                        {j > 0 && <ArrowRight className="h-3 w-3" />}
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-100 text-ink-soft">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      </span>
                    );
                  })}
                  <span className="ml-1.5">{route.totalDurationLabel} door to door</span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-clay-700">{money(total)}</p>
                <p className="text-xs text-ink-faint">per person</p>
              </div>
            </div>

            {/* One row per leg, joined by a vertical line like a timeline. */}
            <ol className="relative space-y-5 border-l-2 border-dashed border-sand-200 pl-7">
              {route.legs.map((leg, j) => {
                const Icon = MODE_ICONS[leg.mode];
                return (
                  <li key={j} className="relative text-sm">
                    {/* The icon sits ON the timeline line (pulled left over it). */}
                    <span className="absolute -left-[45px] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-clay-600 ring-2 ring-sand-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-ink">
                        {leg.from} <span className="text-ink-faint">→</span> {leg.to}
                      </p>
                      <span className="whitespace-nowrap font-medium tabular-nums text-ink-soft">{money(leg.price)}</span>
                    </div>
                    <p className="mt-0.5 text-ink-soft">{leg.service}</p>
                    <p className="mt-0.5 tabular-nums text-ink-faint">
                      {leg.departTime} → {leg.arriveTime} · {leg.durationLabel}
                    </p>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}

      <p className="text-center text-xs text-ink-faint">The way back is usually the same route in reverse.</p>
    </div>
  );
}
