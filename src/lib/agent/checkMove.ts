// Decides whether moving ONE activity to a different day still makes a sensible trip.
// Same tool-calling + Zod + one-retry pattern as swapDays.ts.
//
// Times are checked instantly in the browser (see src/lib/feasibility.ts). This AI check is for
// the things plain code can't know: e.g. the activity is in Kyoto but the new day is spent in
// Tokyo, or it's a hotel check-in that only makes sense on the day you arrive.
import { z } from "zod";
import { createCompletion, SMART_MODEL, toHistory, type ChatMessage } from "@/lib/agent/llm";
import { describeActivity, describeDay } from "@/lib/agent/prompts";
import { MoveDecisionSchema, type MoveDecision, type BoardActivity, type BoardDay } from "@/lib/schemas";
import { formatDay } from "@/lib/dates";

const MAX_ATTEMPTS = 2;

const MOVE_SYSTEM_PROMPT = `You are TripCanvas's scheduling assistant. The traveler dragged ONE
activity from one day of their trip to another day. Judge whether the trip still makes sense
with the activity on the new day.

Rules:
- Reply ONLY by calling the decide_move tool.
- Ignore exact start times; those are checked separately.
- allowed: false when the move clearly doesn't work, for example:
  - the activity is in a different city or region than the rest of the new day, so the traveler
    would have to be in two places at once;
  - it's tied to its original day: the journey there or back home, a hotel check-in or check-out,
    or a transfer between cities;
  - on the new day the traveler hasn't arrived yet, or has already left.
- allowed: true for ordinary sightseeing, food or activities in the same city or area. When in
  doubt, allow it.
- reason: a very short, friendly reason (at most 12 words), e.g.
  "Fushimi Inari is in Kyoto, but Day 2 is in Tokyo."`;

function buildMoveJsonSchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(MoveDecisionSchema);
  delete schema.$schema;
  return schema;
}

const decideMoveTool = {
  type: "function" as const,
  function: {
    name: "decide_move",
    description: "Decide whether moving this activity to the new day is OK.",
    parameters: buildMoveJsonSchema(),
  },
};

export async function checkMove(
  destination: string,
  totalDays: number,
  activity: BoardActivity,
  fromDay: BoardDay,
  toDay: BoardDay,
): Promise<MoveDecision> {
  const userMessage = `Trip to ${destination}, ${totalDays} days.

Activity being moved: ${describeActivity(activity)}

It was on Day ${fromDay.index + 1} (${formatDay(fromDay.date)}), which has:
${describeDay(fromDay)}

It would move to Day ${toDay.index + 1} (${formatDay(toDay.date)}), which has:
${describeDay(toDay)}

Is this move OK?`;

  const messages: ChatMessage[] = [
    { role: "system", content: MOVE_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await createCompletion({
        model: SMART_MODEL,
        messages,
        tools: [decideMoveTool],
        tool_choice: { type: "function", function: { name: "decide_move" } },
        temperature: 0.3, // a judgment call, not a creative one
        max_completion_tokens: 1000,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`checkMove attempt ${attempt} failed at the API:`, lastError);
      continue;
    }

    const message = response.choices[0].message;
    const toolCall = message.tool_calls?.[0];
    if (!toolCall) {
      lastError = "The AI did not call decide_move";
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(toolCall.function.arguments);
    } catch {
      lastError = "arguments were not valid JSON";
      continue;
    }

    const result = MoveDecisionSchema.safeParse(json);
    if (result.success) return result.data;

    lastError = z.prettifyError(result.error);
    console.warn(`checkMove attempt ${attempt} returned invalid data:`, lastError);

    messages.push(toHistory(message));
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: `Your answer was rejected: ${lastError}. Call decide_move again with the problem fixed.`,
    });
  }

  throw new Error(`The AI couldn't decide on the move. Last error: ${lastError}`);
}
