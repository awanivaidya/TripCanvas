// Home page ("/"). A *server component*: it runs on the server, so it can call auth()
// directly to check whether you're logged in, before any HTML reaches the browser.
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowUpRight, GripVertical, Info, Map as MapIcon, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { auth, signIn } from "@/auth";
import { HERO_COOKIE, nextHeroClip } from "@/lib/heroClips";
import { HeroVideo } from "@/components/HeroVideo";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// Who built it, for the About section and the footer.
const AUTHOR = {
  name: "Awani Mahesh Vaidya",
  links: [
    { label: "GitHub", href: "https://github.com/awanivaidya" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/awani-vaidya-117936282/" },
  ],
};
const BUILT_WITH = ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Groq", "Google Maps Platform"];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: "Tell us the vibe",
    text: "Hills and quiet mornings, or beaches and street food? Chat about the trip you want, even if you don't know where yet.",
  },
  {
    icon: Sparkles,
    title: "Get a day-by-day plan",
    text: "Every train, flight and cab from your door, real places to see and eat, and a hotel that fits your budget.",
  },
  {
    icon: GripVertical,
    title: "Shape it your way",
    text: "Drag cards between days, or just ask the chat: “make day two slower” and the plan updates.",
  },
];

export default async function Home() {
  const session = await auth();

  // Already logged in? Skip the landing page and go straight to your trips.
  if (session) redirect("/trips");

  // The background video: a different clip on every visit. The cookie says which one this
  // browser saw last time, and we show the next one in the list (see lib/heroClips.ts).
  const lastClip = (await cookies()).get(HERO_COOKIE)?.value;
  const clip = nextHeroClip(lastClip);

  return (
    <main>
      {/* The first thing anyone sees: what this is, and its limits. (The full note is further down.) */}
      <div className="flex items-center justify-center gap-2 bg-clay-600 px-4 py-2 text-center text-sm text-white">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">A student project.</span> It runs on free AI plans, so only a few trips a
          day can be planned, and times and prices are estimates.{" "}
          <Link href="/sample" className="font-semibold underline underline-offset-2 hover:no-underline">
            See a sample trip
          </Link>
        </p>
      </div>

      {/* ---------- Hero: a full-screen video with the pitch on top ---------- */}
      <section className="relative flex min-h-[92vh] flex-col overflow-hidden bg-shade">
        <HeroVideo clip={clip} />
        {/* Dark gradient from the bottom, so white text is readable on any video. */}
        <div className="absolute inset-0 bg-gradient-to-t from-shade/85 via-shade/30 to-shade/20" />
        {/* ...and a short one from the top, for the logo and "Sign in": some clips have a bright sky. */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-shade/50 to-transparent" />

        <nav className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Logo href="/" onPhoto />
          <div className="flex items-center gap-2">
            <ThemeToggle onPhoto />
            <GoogleSignIn variant="nav" />
          </div>
        </nav>

        <div className="relative z-10 mx-auto mt-auto w-full max-w-6xl px-6 pb-20">
          <p className="mb-5 flex animate-fade-up items-center gap-3 text-base font-large font-semibold uppercase tracking-[0.5em] text-white/80">
            <span className="h-px w-20 bg-white/60" />
            AI trip planner
          </p>
          <h1
            className="max-w-3xl animate-fade-up text-5xl leading-[1.05] text-white sm:text-7xl"
            style={{ animationDelay: "100ms" }}
          >
            Plan the trip.
            <br />
            {/* On the photo this text must stay light in both themes. clay-100 turns dark in dark mode,
                so there we use clay-700, which dark mode makes a light green. */}
            <em className="text-clay-100 dark:text-clay-700">Not the spreadsheet.</em>
          </h1>
          <p
            className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-white/85"
            style={{ animationDelay: "200ms" }}
          >
            Describe the trip you have in mind. TripCanvas plans every day, from the train at your door to
            dinner on the last night, and lets you reshape it in seconds.
          </p>
          <div className="mt-9 flex animate-fade-up flex-wrap items-center gap-5" style={{ animationDelay: "300ms" }}>
            <GoogleSignIn variant="hero" />
            {/* No sign-in needed: a finished trip to explore (it uses no AI, so it always works). */}
            <Link
              href="/sample"
              className="inline-flex h-13 items-center gap-2.5 rounded-full border border-white/50 px-6 text-base font-medium text-white backdrop-blur-sm transition hover:bg-surface hover:text-ink"
            >
              <MapIcon className="h-5 w-5" />
              See a sample trip
            </Link>
            <span className="text-sm text-white/70">Free · a new plan takes 1–3 minutes</span>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-600">How it works</p>
        <h2 className="mt-3 max-w-2xl text-4xl leading-tight">From “somewhere with hills” to a plan you can book.</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="animate-fade-up" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-clay-50 text-clay-700">
                  <step.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="font-display text-4xl text-ink-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-2xl">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>

        {/* Honest about the limits up front, so a busy AI isn't a surprise. */}
        <div className="mt-16 flex max-w-3xl items-start gap-3 rounded-2xl border border-sand-200 bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-clay-600" />
          <p>
            <span className="font-medium text-ink">Good to know.</span> TripCanvas is a student project running on
            free plans. The AI can plan only a few trips a day in total, shared by everyone, and answers about one chat
            message a minute. If it&rsquo;s busy, explore the{" "}
            <Link href="/sample" className="font-medium text-clay-700 underline-offset-2 hover:underline">
              sample trip
            </Link>{" "}
            or come back later. Times, prices and routes are AI estimates: check them before you book.
          </p>
        </div>
      </section>

      {/* ---------- About: why it exists, who made it ---------- */}
      <section className="border-t border-sand-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-600">About</p>
            <h2 className="mt-3 text-4xl leading-tight">Why TripCanvas exists</h2>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-ink-soft">
            <p>
              TripCanvas is a passion project, born out of a real problem I faced: keeping track of all the tiny details of
              planning a trip. Even a basic outline took hours of research and manual work. TripCanvas does that work for
              you, while keeping you in control.
            </p>
            <p>
              The AI drafts the plan; code checks everything it can (times, time zones, opening hours, costs); and nothing
              on your board changes until you say so.
            </p>
            <ul className="flex flex-wrap gap-2 pt-1" aria-label="Built with">
              {BUILT_WITH.map((tech) => (
                <li key={tech} className="rounded-full bg-sand-100 px-3 py-1 text-sm text-ink-soft">
                  {tech}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-sand-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-8 text-sm text-ink-faint">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Logo href="/" />
            <p>
              Built by <span className="font-medium text-ink">{AUTHOR.name}</span>
            </p>
            <div className="flex items-center gap-4">
              {AUTHOR.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-clay-700 transition hover:text-ink"
                >
                  {link.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            {/* Mixkit's free clips don't require credit, but saying where a video came from is good manners. */}
            <a href={clip.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
              Video: {clip.label} · Mixkit
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

// "Sign in with Google": a form whose `action` is a *server action*, a function marked "use server"
// that runs on the server when the form is submitted. No API route or fetch() code needed.
function GoogleSignIn({ variant }: { variant: "nav" | "hero" }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/trips" });
      }}
    >
      {variant === "nav" ? (
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-full border border-white/40 px-5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-surface hover:text-ink"
        >
          Sign in
        </button>
      ) : (
        <button
          type="submit"
          className="inline-flex h-13 cursor-pointer items-center gap-3 rounded-full bg-surface px-7 text-base font-medium text-ink shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
        >
          <GoogleLogo />
          Continue with Google
        </button>
      )}
    </form>
  );
}

// Google's "G" mark. Sign-in buttons are expected to show it, so people recognise the option.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
