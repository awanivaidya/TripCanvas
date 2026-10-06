// GET /api/calendar/free?tz=Asia/Kolkata: the stretches of days in the next 6 months with nothing in
// the user's Google Calendar. `tz` is the browser's time zone: "a free day" means a day where they
// live. Only busy/free times are read, never event details (see lib/calendar.ts).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LOOKAHEAD_DAYS, getBusyBlocks, getCalendarToken } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { busyDates, findFreeStretches, localDate, safeTimeZone } from "@/lib/freeDates";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  // null = not connected (or the user took the permission away): the chat offers to connect again.
  const token = await getCalendarToken(session.user.id);
  if (!token) return NextResponse.json({ connected: false });

  const timeZone = safeTimeZone(new URL(request.url).searchParams.get("tz"));
  const now = new Date();
  // From tomorrow (today is already under way) to 6 months ahead, as dates where the user lives.
  const from = addDays(localDate(now, timeZone), 1);
  const to = addDays(from, LOOKAHEAD_DAYS - 1);

  try {
    // One day extra at the end, so the last date is fully covered in any time zone.
    const blocks = await getBusyBlocks(token, now, new Date(now.getTime() + (LOOKAHEAD_DAYS + 2) * 24 * 60 * 60 * 1000));
    const stretches = findFreeStretches(busyDates(blocks, timeZone), from, to);
    return NextResponse.json({ connected: true, from, to, stretches });
  } catch (error) {
    console.error("Calendar lookup failed:", error);
    // The most common setup mistake, worth its own message.
    const notEnabled = String(error).includes("has not been used in project") || String(error).includes("accessNotConfigured");
    return NextResponse.json(
      {
        error: notEnabled
          ? "The Google Calendar API isn't enabled for this app yet (Google Cloud Console → APIs & Services → Library)."
          : "Couldn't reach Google Calendar. Try again in a moment.",
      },
      { status: 502 },
    );
  }
}
