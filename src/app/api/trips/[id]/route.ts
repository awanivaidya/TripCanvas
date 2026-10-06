// /api/trips/[id]: save the board (PATCH) or delete the trip (DELETE).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BoardSaveSchema } from "@/lib/schemas";
import { getTripForUser, saveBoard, toBoardDays } from "@/lib/trips";

// In Next.js 15, `params` (the [id] part of the URL) is a Promise, so we await it.
type Context = { params: Promise<{ id: string }> };

// GET: read the trip's current days/activities. Used by the board to re-sync after a
// server-side change it didn't compute itself (e.g. after an AI-approved day swap).
export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  return NextResponse.json({ days: toBoardDays(trip) });
}

// PATCH: the board sends its whole current state, and we make the database match it.
export async function PATCH(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  // 404 (not 403) for someone else's trip, so we don't reveal that it exists.
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = BoardSaveSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid board data" }, { status: 400 });

  // Security: only allow days that belong to THIS trip.
  const tripDayIds = new Set(trip.days.map((d) => d.id));
  if (!parsed.data.days.every((d) => tripDayIds.has(d.id))) {
    return NextResponse.json({ error: "Unknown day" }, { status: 400 });
  }

  // Shared with the chat route (an AI edit is saved exactly like a drag).
  await saveBoard(trip, parsed.data.days);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  // deleteMany with userId in the filter = "delete it only if it's mine".
  // Days and activities are removed automatically thanks to onDelete: Cascade.
  const { count } = await db.trip.deleteMany({ where: { id, userId: session.user.id } });
  if (count === 0) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
