// Reading WHEN the user is busy from their Google Calendar. Server-only (it uses their Google tokens).
//
// The permission we ask for is the narrowest one that works: calendar.freebusy. With it Google only
// tells us "busy from 09:00 to 17:00", never what the event is, who it's with, or anything else.
//
// Tokens, in short: when the user allows it (app/calendar/connect), Google gives us
//   - an ACCESS token: the key for calendar requests, valid for about an hour, and
//   - a REFRESH token: lets us get a new access token later without asking the user again.
// Both live in the Account table (auth.ts saves them). getCalendarToken hands out a working access
// token, getting a new one with the refresh token when the old one has run out.
import { db } from "@/lib/db";
import type { BusyBlock } from "@/lib/freeDates";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

// How far ahead we look for free dates.
export const LOOKAHEAD_DAYS = 180;
// One free/busy request covers this many days (Google refuses very long ranges).
const DAYS_PER_REQUEST = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Has the user connected their calendar (allowed the permission, and we can renew the access)?
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const account = await db.account.findFirst({ where: { userId, provider: "google" } });
  return Boolean(account?.scope?.includes(CALENDAR_SCOPE) && account.refresh_token);
}

// A working access token for the user's calendar, or null when it isn't connected (never allowed,
// or the user took the permission away in their Google account).
export async function getCalendarToken(userId: string): Promise<string | null> {
  const account = await db.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.scope?.includes(CALENDAR_SCOPE)) return null;

  // Still valid for at least another minute? Use it. (expires_at is in SECONDS, Date.now() in ms.)
  if (account.access_token && account.expires_at && account.expires_at * 1000 > Date.now() + 60_000) {
    return account.access_token;
  }
  if (!account.refresh_token) return null;

  // Swap the refresh token for a new access token.
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  const data: { access_token?: string; expires_in?: number; error?: string } = await response.json();

  if (!response.ok || !data.access_token) {
    // "invalid_grant" = the user removed our access (or it expired). Forget the calendar permission,
    // so the chat offers to connect again. Any other failure (network...) is left for a retry.
    if (data.error === "invalid_grant") {
      await db.account.update({
        where: { id: account.id },
        data: { scope: account.scope.replace(CALENDAR_SCOPE, "").trim(), refresh_token: null },
      });
    }
    return null;
  }

  await db.account.update({
    where: { id: account.id },
    data: { access_token: data.access_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600) },
  });
  return data.access_token;
}

// Every busy block in the user's main calendar between two moments. Asked in 30-day pieces, all at
// the same time (Promise.all), because one request can't cover six months.
export async function getBusyBlocks(accessToken: string, from: Date, to: Date): Promise<BusyBlock[]> {
  const pieces: { timeMin: string; timeMax: string }[] = [];
  for (let start = from.getTime(); start < to.getTime(); start += DAYS_PER_REQUEST * DAY_MS) {
    const end = Math.min(start + DAYS_PER_REQUEST * DAY_MS, to.getTime());
    pieces.push({ timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() });
  }

  const results = await Promise.all(
    pieces.map(async (piece) => {
      const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        // "primary" = the user's main calendar.
        body: JSON.stringify({ ...piece, items: [{ id: "primary" }] }),
      });
      if (!response.ok) {
        throw new Error(`Google Calendar free/busy failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
      }
      const data: { calendars?: { primary?: { busy?: BusyBlock[]; errors?: { reason: string }[] } } } = await response.json();
      const calendar = data.calendars?.primary;
      if (calendar?.errors?.length) throw new Error(`Google Calendar free/busy error: ${calendar.errors[0].reason}`);
      return calendar?.busy ?? [];
    }),
  );
  return results.flat();
}
