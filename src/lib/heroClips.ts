// The landing page's background videos (client-safe: page.tsx and HeroVideo.tsx both import it).
// Each clip is two files in public/hero/: "<id>.mp4" (about 11 seconds, silent, edited so the
// loop has no visible cut) and "<id>.jpg" (its first frame, shown while the video loads).
// They are free stock clips from Mixkit, under its "Stock Video Free License".
export type HeroClip = {
  id: string; // the file name in public/hero/, without the extension
  label: string; // what it shows, for the credit in the footer
  sourceUrl: string; // the clip's page on Mixkit
};

// The order matters: each visit shows the next one, so neighbours are different kinds of scenery.
export const HERO_CLIPS: HeroClip[] = [
  {
    id: "beach",
    label: "A quiet beach from above",
    sourceUrl: "https://mixkit.co/free-stock-video/flying-over-a-peaceful-and-sunny-beach-42495/",
  },
  {
    id: "ridges",
    label: "A mountain range at sunset",
    sourceUrl: "https://mixkit.co/free-stock-video/view-to-the-horizon-of-a-mountain-range-in-a-5361/",
  },
  {
    id: "canyon",
    label: "A canyon covered in green",
    sourceUrl: "https://mixkit.co/free-stock-video/fly-over-a-huge-canyon-covered-in-vegetation-41401/",
  },
  {
    id: "flight",
    label: "A plane window at dusk",
    sourceUrl: "https://mixkit.co/free-stock-video/panorama-from-the-window-of-an-airplane-at-dusk-40102/",
  },
  {
    id: "dunes",
    label: "Dunes in the Sahara",
    sourceUrl: "https://mixkit.co/free-stock-video/dunes-in-the-sahara-desert-4149/",
  },
  {
    id: "bay",
    label: "A turquoise bay",
    sourceUrl: "https://mixkit.co/free-stock-video/turquoise-blue-water-bay-from-above-5008/",
  },
  {
    id: "road",
    label: "A road at sunset",
    sourceUrl: "https://mixkit.co/free-stock-video/natural-landscape-with-a-road-at-sunset-50267/",
  },
  {
    id: "alps",
    label: "Mountains in the Alps",
    sourceUrl: "https://mixkit.co/free-stock-video/mountainous-area-in-the-alps-4132/",
  },
];

// The cookie that remembers which clip this browser saw last (HeroVideo.tsx writes it).
export const HERO_COOKIE = "tripcanvas-hero";

// Picks the clip for this visit: the one AFTER the clip the visitor saw last time. So the video
// is different on every visit, and all of them come by before one repeats. A first visit (no
// cookie yet, or a clip we have since removed) starts at a random one.
export function nextHeroClip(lastId: string | undefined): HeroClip {
  const last = HERO_CLIPS.findIndex((clip) => clip.id === lastId);
  const next = last === -1 ? Math.floor(Math.random() * HERO_CLIPS.length) : (last + 1) % HERO_CLIPS.length;
  return HERO_CLIPS[next];
}
