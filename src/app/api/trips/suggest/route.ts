// POST /api/trips/suggest: quick AI suggestions used while filling in the trip chat
// (destination ideas, or good/cheap date ranges). Separate from POST /api/trips because
// this is a small, fast call, not the full itinerary generation.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { SuggestInputSchema } from "@/lib/schemas";
import { getSuggestions } from "@/lib/agent/suggest";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }

  const parsed = SuggestInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const suggestions = await getSuggestions(parsed.data);
    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("getSuggestions failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "Couldn't get suggestions right now.") },
      { status: 502 },
    );
  }
}
