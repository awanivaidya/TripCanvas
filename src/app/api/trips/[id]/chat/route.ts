// POST /api/trips/[id]/chat: send a message to the trip page's chat. The AI answers, and may
// PROPOSE a change to the board (see agent/editTrip.ts). Nothing on the board is saved here: the
// proposal goes back to the browser with a readable list of what it changes, and the traveler
// chooses Apply (the board saves it like any other change) or Discard (chat/decision records it).
// Both messages are saved, so the chat is still there next time.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ChatInputSchema } from "@/lib/schemas";
import { getChatMessages, getTripForUser, toBoardDays } from "@/lib/trips";
import { describeBoardChanges } from "@/lib/boardDiff";
import { editTrip } from "@/lib/agent/editTrip";
import { describeTransport, describeTravelers } from "@/lib/travelers";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = ChatInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please type a message" }, { status: 400 });
  const { message } = parsed.data;
  const board = toBoardDays(trip);

  let result;
  try {
    result = await editTrip(
      {
        destination: trip.destination,
        // Older trips have no saved currency: tell the AI to match the costs already on the board.
        currency: trip.currency ?? "the same currency as the existing costs",
        budget: trip.budget,
        interests: trip.interests,
        travelers: describeTravelers(trip.adults, trip.children),
        transport: describeTransport(trip.transportModes),
        dietary: trip.dietary ?? "no restrictions given",
      },
      board,
      await getChatMessages(trip.id),
      message,
    );
  } catch (error) {
    console.error("editTrip failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "The AI couldn't make that change. Try saying it differently.") },
      { status: 502 },
    );
  }

  // The proposal already passed every check inside editTrip (and its new places were found on
  // Google Maps there). Describe it for the preview: "Day 2: added Bomnal Café (13:00)".
  const changes = result.days ? describeBoardChanges(board, result.days) : [];

  // Save both messages only now that everything worked, so a failed request leaves no
  // half-conversation behind. The +1ms keeps them in the right order when sorted by time.
  const now = Date.now();
  await db.chatMessage.createMany({
    data: [
      { tripId: trip.id, role: "user", content: message, createdAt: new Date(now) },
      { tripId: trip.id, role: "assistant", content: result.reply, createdAt: new Date(now + 1) },
    ],
  });

  // `days` is null when the AI only answered a question (or its "change" changes nothing).
  return NextResponse.json({ reply: result.reply, days: changes.length ? result.days : null, changes });
}
