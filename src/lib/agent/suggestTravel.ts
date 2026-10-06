// Generates a few realistic-LOOKING door-to-door travel routes for a trip: every leg from the
// traveler's home town to the destination (e.g. train to the nearest big city, flight, then a cab
// up to a hill town). This is MOCK data: there's no real train/flight API wired in yet (a later
// iteration; see LEARNING.md). The AI makes up plausible services, times and prices from its
// knowledge of real routes, which is enough to build and test the whole feature.
// Same tool-calling + Zod + retry pattern as planTrip.ts, suggest.ts and swapDays.ts.
import { z } from "zod";
import { createCompletion, FAST_MODEL, toHistory, type ChatMessage } from "@/lib/agent/llm";
import { TravelOptionsSchema, type TravelOptions } from "@/lib/schemas";
import { describeTransport } from "@/lib/travelers";

const MAX_ATTEMPTS = 2;

const TRAVEL_SYSTEM_PROMPT = `You are TripCanvas's travel assistant. Plan how the traveler gets
from their home town to their trip destination, door to door.
IMPORTANT: You do not have live timetables or prices. Invent realistic-looking example options
based on your knowledge of the real routes, as if illustrating what a search might show.

Rules:
- Reply ONLY by calling the give_travel_options tool.
- "note" must clearly say these are example/estimated options, not real bookings.
- Give 2-3 different routes, e.g. the fastest, the cheapest, and a comfortable middle option.
- Every route must go ALL the way from the home town to the destination. Small towns usually have
  no airport: start with the leg to the nearest real railway station, airport or bus hub (e.g. a
  train or bus to the nearest big city), then the main leg, then the last leg from the arrival
  airport/station to the destination itself (e.g. a shared cab or bus up to a hill town).
- One leg per vehicle. Use real stations, airports (with their codes), train names and numbers,
  airlines and bus operators that actually serve those routes, with realistic times and durations
  for the real distances.
- Leave realistic waiting time between legs (at least 2 hours before a flight).
- Prices are per person, in the traveler's home currency, and realistic for that country.
- "Travel preference": build every route from those modes only ("road" = bus or cab), as long as
  that's realistic. If a preferred mode can't reach somewhere (no railway, no airport), use the
  closest alternative for that leg and mention it in "note". "No preference" = mix freely.
- If the destination is vague (a description rather than a place), pick one real place that fits
  it, plan the route there, and say which place in "note".`;

function buildTravelJsonSchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(TravelOptionsSchema);
  delete schema.$schema;
  return schema;
}

const giveTravelOptionsTool = {
  type: "function" as const,
  function: {
    name: "give_travel_options",
    description: "Give the traveler a few complete door-to-door travel routes.",
    parameters: buildTravelJsonSchema(),
  },
};

// `origin` is e.g. "Dhing, Assam, IN".
export async function suggestTravel(
  origin: string,
  destination: string,
  currencyCode: string,
  transportModes: string[], // [] = no preference
): Promise<TravelOptions> {
  const userMessage = `From (home town): ${origin}
To: ${destination}
Travel preference: ${describeTransport(transportModes)}
Show prices in ${currencyCode}.`;

  const messages: ChatMessage[] = [
    { role: "system", content: TRAVEL_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await createCompletion({
        model: FAST_MODEL,
        messages,
        tools: [giveTravelOptionsTool],
        tool_choice: { type: "function", function: { name: "give_travel_options" } },
        temperature: 0.5, // realistic routes matter more than variety here
        max_completion_tokens: 3000,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`suggestTravel attempt ${attempt} failed at the API:`, lastError);
      continue;
    }

    const message = response.choices[0].message;
    const toolCall = message.tool_calls?.[0];
    if (!toolCall) {
      lastError = "The AI did not call give_travel_options";
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(toolCall.function.arguments);
    } catch {
      lastError = "arguments were not valid JSON";
      continue;
    }

    const result = TravelOptionsSchema.safeParse(json);
    if (result.success) return result.data;

    lastError = z.prettifyError(result.error);
    console.warn(`suggestTravel attempt ${attempt} returned invalid data:`, lastError);

    messages.push(toHistory(message));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: `Your answer was rejected: ${lastError}. Call give_travel_options again with the problem fixed.`,
    });
  }

  throw new Error(`The AI couldn't produce travel options. Last error: ${lastError}`);
}
