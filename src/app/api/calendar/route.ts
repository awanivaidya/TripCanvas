// GET /api/calendar: has this user connected their Google Calendar? The new-trip chat asks when it
// opens, so the "Find free dates" button knows whether to open Google's permission screen first.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCalendarConnected } from "@/lib/calendar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  return NextResponse.json({ connected: await isCalendarConnected(session.user.id) });
}
