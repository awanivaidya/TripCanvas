// POST /api/trips/[id]/chat/decision: note in the chat whether the traveler applied or discarded the
// AI's last proposal. Applying itself is a normal board save (PATCH /api/trips/[id]); this only keeps
// the saved chat truthful, so next time it doesn't look like a discarded change was made.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ChatDecisionSchema } from "@/lib/schemas";
import { getTripForUser } from "@/lib/trips";

type Context = { params: Promise<{ id: string }> };

// The note is written here, never by the browser, so nobody can put other words in the AI's mouth.
const NOTES = {
  applied: "Applied the change to your board.",
  discarded: "Discarded that change. Your board is as it was.",
};

export async function POST(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { id } = await params;
  const trip = await getTripForUser(id, session.user.id);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const parsed = ChatDecisionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await db.chatMessage.create({
    data: { tripId: trip.id, role: "assistant", content: NOTES[parsed.data.decision] },
  });
  return NextResponse.json({ note: NOTES[parsed.data.decision] });
}
