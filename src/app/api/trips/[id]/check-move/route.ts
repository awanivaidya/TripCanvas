// POST /api/trips/[id]/check-move: ask the AI whether moving one activity to another day makes
// sense. This route only JUDGES the move; it doesn't save anything. If it's allowed, the board
// saves its new state with the usual PATCH /api/trips/[id].
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { CheckMoveInputSchema } from "@/lib/schemas";
import { getTripForUser, toBoardDays } from "@/lib/trips";
import { checkMove } from "@/lib/agent/checkMove";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = CheckMoveInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // The database still has the board as it was BEFORE the drag, so the activity is still
  // in its original day here.
  const days = toBoardDays(trip);
  const fromDay = days.find((d) => d.activities.some((a) => a.id === parsed.data.activityId));
  const toDay = days.find((d) => d.id === parsed.data.toDayId);
  if (!fromDay || !toDay) return NextResponse.json({ error: "Activity or day not found" }, { status: 404 });
  if (fromDay.id === toDay.id) return NextResponse.json({ allowed: true, reason: "Same day." });

  const activity = fromDay.activities.find((a) => a.id === parsed.data.activityId)!;

  try {
    const decision = await checkMove(trip.destination, days.length, activity, fromDay, toDay);
    return NextResponse.json(decision);
  } catch (error) {
    console.error("checkMove failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "Couldn't check whether that move makes sense.") },
      { status: 502 },
    );
  }
}
