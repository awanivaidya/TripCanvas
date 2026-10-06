// One place that decides what buttons look like, so every button in the app matches.
// It returns a className string (not a component), so it works on <button>, on <Link> and on
// form submit buttons alike:  <Link href="/trips/new" className={buttonClass("primary", "lg")}>
type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap " +
  "transition-all duration-200 active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

const variants: Record<Variant, string> = {
  // The main action on a screen: sage, with a soft lift on hover. In dark mode clay-700 is a
  // light text color, too pale under white text, so the hover uses clay-500 there instead.
  primary: "bg-clay-600 text-white shadow-sm hover:bg-clay-700 dark:hover:bg-clay-500 hover:shadow-md hover:-translate-y-px",
  // A second option next to a primary one.
  secondary: "border border-sand-300 bg-surface text-ink hover:border-ink/25 hover:bg-sand-50",
  // Quiet actions (Cancel, Sign out).
  ghost: "text-ink-soft hover:bg-sand-100 hover:text-ink",
  danger: "bg-danger-600 text-white hover:brightness-90",
  // Strong contrast on top of photos.
  dark: "bg-ink text-paper hover:bg-ink/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md"): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

// Text inputs, selects and textareas share one look too.
export const inputClass =
  "w-full rounded-xl border border-sand-200 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint " +
  "transition focus:border-clay-500 focus:outline-none focus:ring-4 focus:ring-clay-100 disabled:opacity-60";
