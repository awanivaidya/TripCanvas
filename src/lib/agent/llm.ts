// The one place that talks to the LLM provider (Groq).
// If we ever switch providers, this is the only file that has to change.
import Groq from "groq-sdk";

// Two models, each with its OWN rate limits on Groq (so one running out doesn't stop the other):
// - SMART_MODEL plans the trip and makes every change to it afterwards (chat edits, the checks
//   on moves and day swaps): the jobs where a mistake lands on the traveler's board.
// - FAST_MODEL helps the new-trip chat (place and date suggestions) and drafts "Getting there":
//   small, quick jobs, where a smaller model is good enough and answers faster.
export const SMART_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const FAST_MODEL = process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b";

let client: Groq | null = null;

// Create the client lazily (on first use), not when the file is imported.
// Groq() throws if GROQ_API_KEY is missing. Doing it lazily means the app can still
// build and run the other pages without a key.
export function getGroq(): Groq {
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

// Re-export the message type so other files don't need to know Groq's naming.
export type ChatMessage = Groq.Chat.Completions.ChatCompletionMessageParam;

type CompletionParams = Parameters<Groq["chat"]["completions"]["create"]>[0] & { stream?: false };

// The AI's reply, ready to add to the conversation for the next call (an agent loop, or a retry
// after a rejected answer): its text and tool call, WITHOUT its "reasoning" (the thinking it did
// before answering). Groq returns that thinking with the reply, and if we send it back, it's
// counted as prompt tokens again: a chat edit grew from ~4,000 tokens to 11,220, over the free
// tier's 8,000 per minute, so it could never be sent. The next call doesn't need it.
export function toHistory(message: Groq.Chat.Completions.ChatCompletionMessage): ChatMessage {
  return { role: "assistant", content: message.content, tool_calls: message.tool_calls };
}

// The longest we'll wait for a rate limit to clear, and how many times.
const MAX_RATE_LIMIT_WAIT_S = 90;
const MAX_RATE_LIMIT_WAITS = 4;
// The smallest answer worth asking for: the AI's thinking plus a tool call. Below this it would be
// cut off mid-JSON anyway.
const MIN_ANSWER_TOKENS = 1500;

// chat.completions.create, but it waits out rate limits instead of failing.
// Groq's free tier allows ~8,000 tokens per MINUTE. One long reply (a 10-day plan is ~12,000)
// uses that up, and the next request is refused until the minute has passed:
//   - "429" with a `retry-after` header (the seconds to wait), or
//   - "413 Request too large ... rate_limit_exceeded", with NO header. Despite the name, the same
//     request goes through a minute later (we tested it), so we treat it as "wait a minute" too.
// The SDK only retries quickly (a few seconds), so we wait ourselves and try again.
export async function createCompletion(params: CompletionParams) {
  let request = params;
  for (let waits = 0; ; waits++) {
    try {
      return await getGroq().chat.completions.create(request);
    } catch (error) {
      const rateLimited =
        error instanceof Groq.APIError &&
        (error.status === 429 || (error.status === 413 && error.message.includes("rate_limit_exceeded")));
      if (!rateLimited || waits >= MAX_RATE_LIMIT_WAITS) throw error;
      // One request bigger than a whole minute's limit ("Limit 8000, Requested 11918") never fits,
      // however long we wait. Groq counts a request as its prompt PLUS max_completion_tokens (the
      // most the answer may use; we measured it: a 3,710-token prompt with 6,000 counted as 9,710).
      // So make room by asking for a shorter answer, by exactly the amount over, and try again now.
      // If even that leaves too little room for a useful answer, the prompt itself is too big.
      const sizes = error.message.match(/Limit (\d+), Requested (\d+)/);
      if (sizes && Number(sizes[2]) > Number(sizes[1])) {
        const over = Number(sizes[2]) - Number(sizes[1]);
        const answerTokens = (request.max_completion_tokens ?? 0) - over - 50; // 50 = a little slack
        if (answerTokens < MIN_ANSWER_TOKENS) throw error;
        console.warn(`Groq: request ${over} tokens too big for one minute; answer limit now ${answerTokens}`);
        request = { ...request, max_completion_tokens: answerTokens };
        continue;
      }
      // The DAILY limit ("tokens per day") only frees up over the next minutes or hours: waiting
      // here would just hang the request (a chat message once took 4 minutes to fail). Give up now,
      // and describeAiFailure tells the user when to come back.
      const retryAfter = Number(error.headers?.get("retry-after"));
      if (error.message.includes("per day") || retryAfter > MAX_RATE_LIMIT_WAIT_S) throw error;
      // No header (the 413): wait a full minute, so the per-minute window has room again.
      const seconds = retryAfter || 60;
      console.warn(`Groq rate limit: waiting ${seconds}s before trying again`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }
}

// The message an API route shows when an AI call failed. `fallback` is for any other failure.
export function describeAiFailure(error: unknown, fallback: string): string {
  const text = String(error);
  if (text.includes("per day")) {
    // Groq says e.g. "Please try again in 20m39.408s": show "20m".
    const wait = text.match(/try again in ((?:\d+h)?(?:\d+m)?)/)?.[1];
    return `The free AI plan's daily limit is used up. Try again ${wait ? `in about ${wait}` : "later"}.`;
  }
  if (text.includes("Request too large")) {
    return "That request was too big for the free AI plan. Try asking for a smaller change.";
  }
  if (text.includes("429") || text.includes("rate_limit")) {
    return "The AI is busy (free tier rate limit). Wait a minute and try again.";
  }
  return fallback;
}
