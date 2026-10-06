"use client";

// The sun/moon button that switches between light and dark mode.
// The theme lives in one place: the "dark" class on <html> (set before the first paint by the
// script in layout.tsx). This button flips that class and remembers the choice in localStorage.
// No React state: both icons are rendered and CSS shows the right one (`dark:hidden`), so the
// button can never disagree with the page, even on the very first render.
import { Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

export function ThemeToggle({ onPhoto = false }: { onPhoto?: boolean }) {
  function toggle() {
    // classList.toggle returns true if the class is now ON.
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Private browsing can block storage; the theme still switches, it just isn't remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition ${
        onPhoto ? "text-white hover:bg-white/15" : "text-ink-soft hover:bg-sand-100 hover:text-ink"
      }`}
    >
      {/* In light mode we offer the moon ("go dark"); in dark mode, the sun. */}
      <Moon className="h-4 w-4 dark:hidden" />
      <Sun className="hidden h-4 w-4 dark:block" />
    </button>
  );
}
