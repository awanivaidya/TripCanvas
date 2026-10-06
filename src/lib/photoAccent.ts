// The trip page's accent color, taken from its background photo. Server-only (it uses sharp, the
// image library Next.js already relies on).
//
// The idea: find the photo's main VIVID color (the red roofs, the blue sea...), then rebuild our
// accent shades (clay-50 ... clay-700) in that color. Each shade keeps the LIGHTNESS of our normal
// sage and only takes the photo's hue, so buttons and text stay exactly as readable as
// before, in light and dark mode, whatever the photo is.
//
// Colors are worked out in OKLCH (Lightness, Chroma = how vivid, Hue = the angle on the color
// wheel). Unlike RGB, its lightness matches what our eyes see, so "same lightness, new hue" really
// does look equally light. Browsers understand oklch() directly in CSS.
import sharp from "sharp";

type Oklch = { l: number; c: number; h: number };
export type PhotoAccent = { hue: number; chromaScale: number };

// Our design's sage shades (globals.css), light and dark mode. Only their lightness and
// vividness are reused; the hue comes from the photo.
const SHADES = ["50", "100", "500", "600", "700"] as const;
const LIGHT: Record<(typeof SHADES)[number], string> = {
  "50": "#eef2ee",
  "100": "#d9e2da",
  "500": "#6d8d72",
  "600": "#597a60",
  "700": "#4d6a53",
};
const DARK: Record<(typeof SHADES)[number], string> = {
  "50": "#252c26",
  "100": "#354237",
  "500": "#6d8d72",
  "600": "#5c7e63",
  "700": "#9fbaa3",
};

// The page's neutral backgrounds and borders (paper, sand-*): a soft sage off-white in our design. They take
// the photo's hue too, but keep their own gentle tint strength (chroma), so they stay calm
// backgrounds, not colored ones. Surface (cards, dialogs) and ink (text) stay as they are.
const NEUTRALS = ["paper", "sand-50", "sand-100", "sand-200", "sand-300"] as const;
const NEUTRAL_LIGHT: Record<(typeof NEUTRALS)[number], string> = {
  paper: "#f5f9f3",
  "sand-50": "#eef4eb",
  "sand-100": "#e1ebdd",
  "sand-200": "#d0deca",
  "sand-300": "#b6c7ad",
};
const NEUTRAL_DARK: Record<(typeof NEUTRALS)[number], string> = {
  paper: "#121511",
  "sand-50": "#181b16",
  "sand-100": "#252922",
  "sand-200": "#30362d",
  "sand-300": "#464e42",
};

// Worked out once per photo, then remembered while the server runs (the photo of a destination
// doesn't change, and re-downloading it on every page load would be slow).
const cache = new Map<string, PhotoAccent | null>();

export async function photoAccent(imageUrl: string): Promise<PhotoAccent | null> {
  if (cache.has(imageUrl)) return cache.get(imageUrl)!;
  const accent = await findAccent(imageUrl).catch(() => null); // no accent = the normal sage
  cache.set(imageUrl, accent);
  return accent;
}

async function findAccent(imageUrl: string): Promise<PhotoAccent | null> {
  // The background is 1920px wide (~700 KB); a 250px version (~20 KB) has the same colors.
  const response = await fetch(imageUrl.replace(/\/\d+px-/, "/250px-"), {
    headers: { "User-Agent": "TripCanvas/1.0 (student trip planner)" }, // Wikipedia asks for this
  });
  if (!response.ok) return null;

  // Shrink to 48x48 and read the raw pixels: 3 bytes (red, green, blue) per pixel.
  const pixels = await sharp(Buffer.from(await response.arrayBuffer()))
    .resize(48, 48, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Sort the vivid pixels into 18 hue "buckets" of 20° each. Each pixel counts by how vivid it is
  // (chroma squared), so a bright red roof beats a big pale sky. Greys, near-black and near-white
  // pixels don't count at all.
  const buckets = Array.from({ length: 18 }, () => ({ weight: 0, x: 0, y: 0, chroma: 0 }));
  for (let i = 0; i < pixels.length; i += 3) {
    const color = rgbToOklch(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (color.c < 0.04 || color.l < 0.2 || color.l > 0.92) continue;
    const weight = color.c * color.c;
    const bucket = buckets[Math.floor(color.h / 20) % 18];
    bucket.weight += weight;
    // Hue is an angle (350° and 10° are close), so it's averaged as a direction, not a number.
    bucket.x += weight * Math.cos((color.h * Math.PI) / 180);
    bucket.y += weight * Math.sin((color.h * Math.PI) / 180);
    bucket.chroma += weight * color.c;
  }

  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
  // A mostly grey photo (fog, snow, an old black-and-white picture): keep our own accent.
  if (best.weight < 0.0005 * (pixels.length / 3)) return null;

  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  const photoChroma = best.chroma / best.weight;
  // A muted photo gets a calmer accent; never more vivid than our design.
  const chromaScale = Math.min(1, Math.max(0.55, photoChroma / hexToOklch(LIGHT["600"]).c));
  return { hue, chromaScale };
}

// The CSS variables for the page (globals.css maps them onto clay-*, paper and sand-*, in light and
// dark mode).
export function accentVariables(accent: PhotoAccent): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const shade of SHADES) {
    // clay-600 is the button color, with WHITE text on it in both modes: it must stay dark enough.
    const minWhiteContrast = shade === "600" ? 4.5 : 0;
    variables[`--accent-${shade}`] = recolor(LIGHT[shade], accent, minWhiteContrast);
    variables[`--accent-dark-${shade}`] = recolor(DARK[shade], accent, minWhiteContrast);
  }
  // The neutrals keep their own (low) vividness: chromaScale 1, never the photo's.
  const tint = { hue: accent.hue, chromaScale: 1 };
  for (const name of NEUTRALS) {
    variables[`--tint-${name}`] = recolor(NEUTRAL_LIGHT[name], tint, 0);
    variables[`--tint-dark-${name}`] = recolor(NEUTRAL_DARK[name], tint, 0);
  }
  return variables;
}

// One of our shades in the photo's hue: same lightness, the photo's hue, a bit less vivid if the
// photo is muted.
// Same OKLCH lightness is *almost* the same contrast, but not quite: at equal lightness a green or
// yellow is a little brighter than our sage, and white text on it dropped to 4.25:1 (the
// accessibility minimum is 4.5:1). So with `minWhiteContrast`, we darken step by step until white
// text reaches it.
function recolor(designHex: string, accent: PhotoAccent, minWhiteContrast: number): string {
  const { l, c } = hexToOklch(designHex);
  const chroma = c * accent.chromaScale;
  let lightness = l;
  while (contrastWithWhite(lightness, chroma, accent.hue) < minWhiteContrast && lightness > 0.3) lightness -= 0.01;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${accent.hue.toFixed(1)})`;
}

// WCAG contrast between white and an OKLCH color: (brighter + 0.05) / (darker + 0.05), where
// "brightness" is relative luminance (0 = black, 1 = white).
function contrastWithWhite(l: number, c: number, h: number): number {
  return 1.05 / (luminance(l, c, h) + 0.05);
}

// The luminance of an OKLCH color as a screen shows it. A color too vivid for the screen is shown
// with less chroma (that's what browsers do), so we lower the chroma until it fits too.
function luminance(l: number, c: number, h: number): number {
  for (let chroma = c; chroma > 0; chroma -= 0.005) {
    const rgb = oklchToLinearRgb(l, chroma, h);
    if (rgb.every((v) => v >= 0 && v <= 1)) return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  return l ** 3; // a grey of that lightness
}

// OKLCH -> linear sRGB (0-1, not yet gamma-curved): the reverse of rgbToOklch below.
function oklchToLinearRgb(l: number, c: number, h: number): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  return rgbToOklch((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

// sRGB (0-255) -> OKLCH. The standard formulas from https://bottosson.github.io/posts/oklab/
export function rgbToOklch(red: number, green: number, blue: number): Oklch {
  // 1. Undo the screen's gamma curve, so the numbers are proportional to real light.
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  // 2. Light -> the eye's three cone responses, then a cube root (how we perceive brightness).
  const lc = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mc = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sc = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  // 3. -> Lightness and two color axes (a: green-red, b: blue-yellow).
  const l = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  const a = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  const bb = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
  // 4. The two color axes as "how vivid" (distance) and "which color" (angle).
  return { l, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}
