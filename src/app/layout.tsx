import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Two fonts, like a travel magazine: Fraunces (a soft, characterful serif) for headings, and
// DM Sans (clean and very readable) for everything else. next/font downloads them at build time
// and serves them from our own site, so there's no flash of the wrong font.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"], // Fraunces' "softness" and optical-size dials, used in globals.css
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TripCanvas · Plan trips you'll actually take",
  description: "Describe your trip and an AI plans it day by day. Then shape it on a drag-and-drop board.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>, not <body>: globals.css defines --font-display on :root
    // (= <html>) as var(--font-fraunces), and a CSS variable can only use variables that exist on
    // the SAME element or its parents. On <body>, --font-fraunces would be one level too low.
    // suppressHydrationWarning: the theme script below may add a "dark" class to <html> before
    // React starts. That's on purpose, so React shouldn't warn that the class differs.
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
