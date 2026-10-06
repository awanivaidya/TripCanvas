// "/trips/new": the server part only checks login, then renders the interactive chat.
// This split is a common pattern: the server page handles auth and data, the client component
// handles clicks and typing.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { TripChatIntake } from "@/components/TripChatIntake";

export default async function NewTripPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-clay-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Your trips
        </Link>
        <div className="mb-8 mt-4 animate-fade-up">
          <h1 className="text-4xl sm:text-5xl">Where to next?</h1>
          <p className="mt-3 text-lg text-ink-soft">
            Answer a few questions and we&rsquo;ll plan every day, door to door.
          </p>
          {/* Set expectations before they spend five minutes answering questions. */}
          <p className="mt-4 flex items-start gap-2 text-sm text-ink-faint">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Planning takes 1–3 minutes. The AI runs on a free plan with a daily limit shared by everyone, so if it
            says it&rsquo;s busy, try again a little later.
          </p>
        </div>
        <TripChatIntake />
      </main>
    </>
  );
}
