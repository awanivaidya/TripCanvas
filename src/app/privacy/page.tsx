// "/privacy": what TripCanvas stores, what it sends to other services, and how to delete it all.
// Public (no sign-in needed to read it). Signed in, it also shows the "delete my account" button.
// Keep it TRUE: when a feature starts storing or sending something new, update this page.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const metadata = { title: "Privacy · TripCanvas" };

const LAST_UPDATED = "6 October 2026";

export default async function PrivacyPage() {
  const session = await auth();

  return (
    <>
      <header className="border-b border-sand-200 bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Logo href="/" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href={session ? "/trips" : "/"}
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-clay-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {session ? "Your trips" : "Home"}
        </Link>
        <h1 className="mt-4 text-4xl sm:text-5xl">Privacy and your data</h1>
        <p className="mt-3 text-sm text-ink-faint">Last updated {LAST_UPDATED}</p>

        <div className="mt-10 space-y-10 leading-relaxed text-ink-soft [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          <p className="text-lg">
            TripCanvas is a student project. It keeps only what it needs to plan and save your trips, never sells
            anything, and you can delete all of it at any time.
          </p>

          <section>
            <h2>What TripCanvas stores</h2>
            <ul>
              <li>Your Google name, email address and profile picture, from signing in.</li>
              <li>
                The sign-in tokens Google gives the app. If you connect Google Calendar, a token that lets the app check
                when you&rsquo;re busy.
              </li>
              <li>
                Your trips: the answers you gave in the planning chat (destination, dates, travelers, home town, food,
                budget, interests, notes), the day-by-day plan, and your chat with the trip assistant.
              </li>
              <li>
                Map coordinates of the places in your plan, used to check travel times. Google&rsquo;s rules allow
                keeping them for 30 days, so older ones are fetched again when you open the trip.
              </li>
            </ul>
          </section>

          <section>
            <h2>What it never stores</h2>
            <ul>
              <li>
                Your calendar events. The calendar permission only shows <em>when</em> you&rsquo;re busy, never what the
                events are. The free dates are worked out when you ask and not saved.
              </li>
              <li>Passwords (Google handles sign-in) or payment details (nothing is sold or booked here).</li>
              <li>Your IP address or exact location.</li>
            </ul>
          </section>

          <section>
            <h2>Services that receive some of it</h2>
            <p className="mb-3">To do its job, TripCanvas sends the minimum needed to these services:</p>
            <ul>
              <li>
                <span className="text-ink">Groq</span> (the AI): your trip answers, the plan and your chat messages, to
                plan and change trips.
              </li>
              <li>
                <span className="text-ink">Google</span>: sign-in; place names, to find them on Google Maps; and, only if
                you connect it, a free/busy check of your calendar.
              </li>
              <li>
                <span className="text-ink">SerpApi</span>: web searches for events, and for the best time to visit a place.
              </li>
              <li>
                <span className="text-ink">ipwho.is</span>: your IP address, to guess your home town and currency. You
                always confirm or change the town. If you choose &ldquo;Use my exact location&rdquo;, your coordinates go to{" "}
                <span className="text-ink">OpenStreetMap</span> instead, to name your town.
              </li>
              <li>
                <span className="text-ink">Wikipedia</span>: your destination&rsquo;s name, to find a photo of it.
              </li>
            </ul>
          </section>

          <section>
            <h2>Deleting your data</h2>
            <p>
              Deleting a trip removes it and its chat for good. Deleting your account removes everything listed above
              and cancels TripCanvas&rsquo;s access to your Google account, including the calendar. It can&rsquo;t be
              undone.
            </p>
            <div className="mt-5">
              {session ? (
                <DeleteAccountButton />
              ) : (
                <p className="text-sm text-ink-faint">Sign in to see the button to delete your account.</p>
              )}
            </div>
          </section>

          <section>
            <h2>Questions</h2>
            <p>
              TripCanvas is built by Awani Mahesh Vaidya. Contact me on{" "}
              <a
                href="https://www.linkedin.com/in/awani-vaidya-117936282/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-clay-700 underline-offset-2 hover:underline"
              >
                LinkedIn
              </a>{" "}
              or{" "}
              <a
                href="https://github.com/awanivaidya"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-clay-700 underline-offset-2 hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
