// Real events (concerts, festivals, matches, shows) from Google's event listings, through SerpApi.
// Server-only: it uses our secret key, SERPAPI_KEY. The chat AI calls this as a tool before adding
// an event, so it never invents a concert that isn't happening.
// We use SerpApi's normal Google search: for "kpop concerts in Seoul" Google shows an events box,
// which SerpApi returns as `events_results`. (Its separate "google_events" engine answered
// "Unsupported search engine" for our free account.)
// Big one-off events (award shows like KGMA, festivals) are often NOT in that box, only in the
// normal web results ("KGMA 2026, Nov 7–8, Gocheok Sky Dome"). So the top web results come along too.
import { formatDay } from "@/lib/dates";
import type { BoardDay } from "@/lib/schemas";

export type FoundEvent = {
  title: string;
  when: string; // date and time as Google shows them: "Oct 11, 4:00 PM"
  startDate: string; // "Oct 12" (Google gives no year)
  venue: string | null;
  link: string | null;
};

// One normal search result: its title and the short text Google shows under it.
export type WebResult = { title: string; snippet: string };

export type EventSearch = { events: FoundEvent[]; web: WebResult[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Search Google's event listings, e.g. "K-pop concerts in Seoul". Returns null when search isn't
// set up (no key), so the AI can say "I can't check live events" instead of guessing.
export async function searchEvents(query: string): Promise<EventSearch | null> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;

  const params = new URLSearchParams({ engine: "google", q: query, hl: "en", gl: "us", api_key: key });
  // A search usually takes 2-5 seconds, but one once hung for over a minute, with the chat waiting
  // on it. After 10 seconds, give up (it throws, and every caller carries on without the results).
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Event search failed (${response.status}): ${(await response.text()).slice(0, 300)}`);

  // One event looks like: { title: "AKMU CONCERT", type: "K-pop concert", date: "Oct 11",
  // time: "4:00 PM", address: ["KSPO DOME", "Seoul, South Korea"] }
  const data: {
    events_results?: { title: string; type?: string; date?: string; time?: string; address?: string[]; link?: string }[];
    organic_results?: { title: string; snippet?: string }[];
  } = await response.json();

  return {
    events: (data.events_results ?? []).map((e) => ({
      title: e.type ? `${e.title} (${e.type})` : e.title,
      when: [e.date, e.time].filter(Boolean).join(", ") || "date unknown",
      startDate: e.date ?? "",
      venue: e.address?.join(", ") ?? null,
      link: e.link ?? null,
    })),
    // 5 is enough to find the dates, and keeps the AI's prompt short.
    web: (data.organic_results ?? []).slice(0, 5).map((o) => ({ title: o.title, snippet: o.snippet ?? "" })),
  };
}

// Which day of the trip an event falls on (0-based), or null if it's not during the trip.
// Code does this date math, not the AI. Google's dates have no year ("Oct 12"), so we try the
// year(s) the trip is in.
export function tripDayOfEvent(event: FoundEvent, board: BoardDay[]): number | null {
  const match = event.startDate.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month === -1) return null;
  const day = Number(match[2]);

  for (const tripDay of board) {
    const date = new Date(tripDay.date);
    if (date.getUTCMonth() === month && date.getUTCDate() === day) return tripDay.index;
  }
  return null;
}

// The search results as text for the AI, with each event marked as during the trip (and on which
// day) or not. Kept short: every line costs tokens in the conversation.
export function describeEventsForAI(query: string, search: EventSearch | null, board: BoardDay[]): string {
  if (search === null) {
    return "Live event search isn't set up, so you can't check real events. Don't invent any: tell the traveler you can't check live listings, and suggest they check the official ticket sites.";
  }
  // With the year: web results often mention earlier years' dates of the same event.
  const year = new Date(board[0].date).getUTCFullYear();
  const tripDays = board.map((d) => `Day ${d.index + 1} = ${formatDay(d.date)}`).join(", ");
  const parts = [`Search: "${query}". The trip is in ${year}: ${tripDays}.`];

  if (search.events.length) {
    // Listings with a date: code works out which trip day (if any) each one is on.
    const lines = search.events.slice(0, 10).map((e, i) => {
      const day = tripDayOfEvent(e, board);
      const timing = day === null ? "NOT during the trip" : `DURING THE TRIP: Day ${day + 1}`;
      return `${i + 1}. ${e.title} · ${e.when}${e.venue ? ` · ${e.venue}` : ""} · ${timing}`;
    });
    parts.push(`Event listings:\n${lines.join("\n")}`);
  } else {
    parts.push("Event listings: none.");
  }

  if (search.web.length) {
    const lines = search.web.map((w, i) => `${i + 1}. ${w.title}: ${w.snippet}`);
    parts.push(
      `Web results (not listings: read the dates yourself, and ONLY trust dates clearly for ${year}; pages about earlier years show old dates):\n${lines.join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
