// DELETE /api/account: delete the signed-in user and EVERYTHING of theirs.
// One `db.user.delete` is enough: the schema says `onDelete: Cascade` on every link to a user, so
// the database removes their trips (with days, cards and chats), Google account link (tokens) and
// sessions in the same step. Signed out, too: the session is gone.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  // First, tell Google to cancel TripCanvas's access (sign-in and calendar), so it also disappears
  // from "Third-party apps with account access" in their Google account. Best effort: if Google
  // is unreachable, the data is still deleted below.
  const google = await db.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { refresh_token: true, access_token: true },
  });
  const token = google?.refresh_token ?? google?.access_token;
  if (token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => null);
  }

  await db.user.delete({ where: { id: session.user.id } });
  return new NextResponse(null, { status: 204 }); // 204 No Content: done, nothing to send back
}
