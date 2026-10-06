// The central Auth.js config. Everything login-related comes from here.
//
// How Google login works (OAuth), in short:
//   1. The user clicks "Sign in with Google" and we redirect them to Google.
//   2. They log in *on Google's site*. We never see their password.
//   3. Google redirects back to /api/auth/callback/google with a one-time code.
//   4. Auth.js swaps that code for the user's profile (name, email, picture),
//      saves User + Account rows via the Prisma adapter, creates a Session row,
//      and sets a session cookie in the browser.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { CALENDAR_SCOPE } from "@/lib/calendar";

// NextAuth() gives back four things we export and use across the app:
//   handlers: the GET/POST handlers for the /api/auth/* routes
//   auth:     call `await auth()` anywhere on the server to get the current session
//   signIn / signOut: start or end a login
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db), // store users and sessions in our Postgres database
  // Google() automatically reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from .env
  providers: [Google],
  callbacks: {
    // "Find free dates in my Google Calendar" sends the user through Google's permission screen
    // again, asking for one more permission (app/calendar/connect). Auth.js only saves an account's
    // tokens the FIRST time it sees that account, so we save the new ones ourselves: the access
    // token, when it runs out, which permissions it has, and the refresh token (to renew it later).
    // Only when the calendar permission is in there: a normal sign-in comes without it, and must
    // not overwrite the calendar tokens we already have.
    async signIn({ account }) {
      if (account?.provider === "google" && account.scope?.includes(CALENDAR_SCOPE)) {
        await db.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data: {
            access_token: account.access_token,
            expires_at: account.expires_at,
            scope: account.scope,
            // Google sends the refresh token only when the user has just said yes; keep the old one otherwise.
            ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
          },
        });
      }
      return true; // true = let the sign-in continue
    },
    // By default the session only has name/email/image. We also add the user's id,
    // because we need it to find *their* trips in the database.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
