// The top bar shown on logged-in pages: logo, user, sign out.
// A server component (no "use client"), so the sign-out server action can live right here.
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonClass } from "@/components/ui/button";

type Props = { user: { name?: string | null; image?: string | null } };

export function AppHeader({ user }: Props) {
  return (
    // Sticky + a see-through blur: the header stays put while the page scrolls under it.
    <header className="sticky top-0 z-30 border-b border-sand-200 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-8 w-8 rounded-full ring-2 ring-surface" />
          )}
          <span className="hidden text-sm text-ink-soft sm:inline">{user.name}</span>
          {/* What's stored, and the "delete my account" button. */}
          <Link href="/privacy" className="hidden text-sm text-ink-faint transition hover:text-ink sm:inline">
            Privacy
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className={buttonClass("ghost", "sm")}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
