// POST /api/trips/[id]/swap-days: ask the AI whether swapping two days is sensible, and if
// so, apply the swap (activities move from Day A to Day B and back) in the database.
import { NextResponse } from "next/server";
import { describeAiFailure } from "@/lib/agent/llm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { SwapDaysInputSchema } from "@/lib/schemas";
import { getTripForUser, toBoardDays } from "@/lib/trips";
import { checkDaySwap } from "@/lib/agent/swapDays";
import { findJourneyProblem } from "@/lib/feasibility";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = SwapDaysInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (parsed.data.dayAId === parsed.data.dayBId) {
    return NextResponse.json({ error: "Can't swap a day with itself" }, { status: 400 });
  }

  // Reuse the same DB-row -> BoardDay conversion the trip page and the GET route use.
  const boardDays = toBoardDays(trip);
  const dayA = boardDays.find((d) => d.id === parsed.data.dayAId);
  const dayB = boardDays.find((d) => d.id === parsed.data.dayBId);
  if (!dayA || !dayB) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  // Instant check first (no AI needed): would the swap put the journey legs out of order?
  // E.g. swapping Day 1 (train → flight → cab) with Day 3 puts the arrival after sightseeing.
  const swapped = boardDays.map((day) => {
    if (day.id === dayA.id) return { ...day, activities: dayB.activities };
    if (day.id === dayB.id) return { ...day, activities: dayA.activities };
    return day;
  });
  const journeyProblem = findJourneyProblem(swapped);
  if (journeyProblem) return NextResponse.json({ allowed: false, reason: journeyProblem });

  let decision;
  try {
    decision = await checkDaySwap(dayA, dayB);
  } catch (error) {
    console.error("checkDaySwap failed:", error);
    return NextResponse.json(
      { error: describeAiFailure(error, "Couldn't check whether that swap makes sense.") },
      { status: 502 },
    );
  }

  if (!decision.allowed) {
    // Nothing changes in the database — the board just needs to snap back visually.
    return NextResponse.json({ allowed: false, reason: decision.reason });
  }

  // Apply the swap: every activity on Day A moves to Day B, and vice versa.
  // Also apply any small text/time adjustments the AI suggested (e.g. renaming "Arrival...").
  const adjustmentsByActivityId = new Map((decision.adjustments ?? []).map((a) => [a.activityId, a]));

  function buildUpdateData(activityId: string) {
    const adjustment = adjustmentsByActivityId.get(activityId);
    if (!adjustment) return {};
    return { [adjustment.field]: adjustment.newValue };
  }

  await db.$transaction([
    ...dayA.activities.map((a) =>
      db.activity.update({ where: { id: a.id }, data: { dayId: dayB.id, ...buildUpdateData(a.id) } }),
    ),
    ...dayB.activities.map((a) =>
      db.activity.update({ where: { id: a.id }, data: { dayId: dayA.id, ...buildUpdateData(a.id) } }),
    ),
  ]);

  return NextResponse.json({ allowed: true, reason: decision.reason });
}
