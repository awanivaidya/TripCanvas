// "/calendar/connect": opened in a small pop-up by the new-trip chat ("Find free dates in my Google
// Calendar"). It says exactly what we'll be able to see, then sends the user to Google's permission
// screen. A pop-up, so the chat (and every answer in it) stays as it is in the main window.
import { redirect } from "next/navigation";
import { CalendarSearch, EyeOff, ShieldCheck } from "lucide-react";
import { auth, signIn } from "@/auth";
import { CALENDAR_SCOPE } from "@/lib/calendar";
import { buttonClass } from "@/components/ui/button";

export default async function ConnectCalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm animate-scale-in space-y-5 rounded-3xl bg-surface p-7 shadow-xl shadow-shade/5 ring-1 ring-sand-200">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-50 text-clay-600">
          <CalendarSearch className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl leading-tight">Find your free dates</h1>
          <p className="text-sm leading-relaxed text-ink-soft">
            TripCanvas will ask Google for one thing: <span className="font-medium text-ink">when you&rsquo;re busy</span>,
            so it can suggest dates when you&rsquo;re free.
          </p>
        </div>
        <ul className="space-y-2.5 text-sm text-ink-soft">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" />
            It sees only busy and free times in your main calendar.
          </li>
          <li className="flex items-start gap-2.5">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" />
            It can&rsquo;t see what your events are or who they&rsquo;re with, and it can&rsquo;t change anything.
          </li>
        </ul>
        {/* A server action, like the sign-in button on the home page. The third argument adds to the
            request we send Google: */}
        <form
          action={async () => {
            "use server";
            const current = await auth();
            await signIn(
              "google",
              { redirectTo: "/calendar/connected" },
              {
                // The usual sign-in permissions, plus the calendar one.
                scope: `openid email profile ${CALENDAR_SCOPE}`,
                access_type: "offline", // also give us a refresh token (to check again another day)
                prompt: "consent", // always show the permission screen: Google only sends the refresh token then
                include_granted_scopes: "true",
                // Pre-select the account they're signed in with, so they don't connect a different one.
                login_hint: current?.user?.email ?? "",
              },
            );
          }}
        >
          <button type="submit" className={`${buttonClass("primary", "lg")} w-full`}>
            Continue with Google
          </button>
        </form>
        <p className="text-center text-xs text-ink-faint">You can remove this access any time in your Google account.</p>
      </div>
    </main>
  );
}
