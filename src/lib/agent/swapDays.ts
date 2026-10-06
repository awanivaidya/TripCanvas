// Decides whether it's OK to swap the activities of two days on the itinerary.
// Same tool-calling + Zod + one-retry pattern as planTrip.ts and suggest.ts.
//
// Why ask the AI at all, instead of just swapping the arrays in the database?
// Because a day isn't just "a list of cards" — it's tied to a real date and often a specific
// place (an arrival, a city, a hotel). Blindly swapping Day 1 (arrival in Tokyo) with Day 3
// (already in Kyoto) would produce a nonsense itinerary. The AI looks at what's actually
// IN each day and judges whether swapping makes sense.
import { z } from "zod";
import { createCompletion, SMART_MODEL, toHistory, type ChatMessage } from "@/lib/agent/llm";
import { SwapDecisionSchema, type SwapDecision, type BoardDay } from "@/lib/schemas";
import { formatDay } from "@/lib/dates";
import { describeDay } from "@/lib/agent/prompts";

const MAX_ATTEMPTS = 2;

const SWAP_SYSTEM_PROMPT = `You are TripCanvas's scheduling assistant. The user wants to swap
the activities of two days in their itinerary: each day's plan moves to the other day's date.
Judge whether that still makes a sensible trip.

Rules:
- Reply ONLY by calling the decide_swap tool.
- allowed: false when the days are tied to different places in a way a swap would break —
  e.g. one day is clearly an arrival/departure day, or the activities are in a different city
  or region than the other day, so swapping would mean teleporting between cities out of order.
- allowed: true when the days' activities are just regular sightseeing/food/activities in the
  same city or region — order doesn't materially matter, or minor adjustments fix it.
- reason: a very short, friendly reason (at most 12 words) that makes sense to the traveler, e.g.
  "Day 3 is in Kyoto, Day 1 is in Tokyo." Always call days by their number ("Day 1", "Day 3"),
  and name the actual place or activity that's the problem.
- adjustments: only when allowed is true AND something needs a small tweak after swapping
  (e.g. a title like "Arrival in Tokyo" should be edited since it's no longer day 1). Leave
  the array out entirely if nothing needs adjusting — most swaps need no adjustments.`;

function buildSwapJsonSchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(SwapDecisionSchema);
  delete schema.$schema;
  return schema;
}

const decideSwapTool = {
  type: "function" as const,
  function: {
    name: "decide_swap",
    description: "Decide whether swapping these two days' activities is OK.",
    parameters: buildSwapJsonSchema(),
  },
};

export async function checkDaySwap(dayA: BoardDay, dayB: BoardDay): Promise<SwapDecision> {
  // Days are labelled with their real numbers ("Day 1"), so the AI's reason uses the same names
  // the traveler sees on the board. (With "Day A/Day B" labels, it wrote reasons like
  // "Day B is arrival day", which meant nothing to the traveler.)
  const a = `Day ${dayA.index + 1}`;
  const b = `Day ${dayB.index + 1}`;
  const userMessage = `${a} (${formatDay(dayA.date)}):
${describeDay(dayA)}

${b} (${formatDay(dayB.date)}):
${describeDay(dayB)}

The activity ids for reference — ${a}: ${dayA.activities.map((x) => x.id).join(", ") || "none"}.
${b}: ${dayB.activities.map((x) => x.id).join(", ") || "none"}.

Should ${a} and ${b} swap their activities?`;

  const messages: ChatMessage[] = [
    { role: "system", content: SWAP_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await createCompletion({
        model: SMART_MODEL,
        messages,
        tools: [decideSwapTool],
        tool_choice: { type: "function", function: { name: "decide_swap" } },
        temperature: 0.3, // this is a judgment call, not a creative one — keep it consistent
        max_completion_tokens: 1500,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`checkDaySwap attempt ${attempt} failed at the API:`, lastError);
      continue;
    }

    const message = response.choices[0].message;
    const toolCall = message.tool_calls?.[0];
    if (!toolCall) {
      lastError = "The AI did not call decide_swap";
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(toolCall.function.arguments);
    } catch {
      lastError = "arguments were not valid JSON";
      continue;
    }

    const result = SwapDecisionSchema.safeParse(json);
    if (result.success) return result.data;

    lastError = z.prettifyError(result.error);
    console.warn(`checkDaySwap attempt ${attempt} returned invalid data:`, lastError);

    messages.push(toHistory(message));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: `Your answer was rejected: ${lastError}. Call decide_swap again with the problem fixed.`,
    });
  }

  throw new Error(`The AI couldn't decide on the swap. Last error: ${lastError}`);
}
