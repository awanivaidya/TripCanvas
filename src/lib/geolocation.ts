// Guess the visitor's home city/country from their IP address.
//
// Why server-side, not the browser? The browser doesn't know its own public IP, and asking
// for real GPS location (navigator.geolocation) needs a permission popup. Looking up the IP
// on the SERVER (where we can read the real request headers) needs no popup and works
// automatically — at the cost of being approximate (usually right city/region, not exact).
import { currencyForCountry } from "@/lib/currency";

export type HomeLocation = {
  city: string;
  region: string; // state/province, e.g. "Assam". Can be "" if unknown.
  countryCode: string; // "US", "IN", ...
  currency: { code: string; symbol: string };
};

// Used when the lookup fails (network hiccup, service down, rate limit).
// Exported so callers can tell "we really know where you are" apart from "this is a guess".
export const FALLBACK_LOCATION: HomeLocation = {
  city: "your city",
  region: "",
  countryCode: "US",
  currency: currencyForCountry("US"),
};

// "Dhing, Assam, IN": the text we give the AI. The region matters for small towns: the AI may
// not know "Dhing" alone, but "Dhing, Assam" tells it the nearest big city is Guwahati.
export function describeLocation(home: HomeLocation): string {
  return [home.city, home.region, home.countryCode].filter(Boolean).join(", ");
}

// Reads the visitor's real IP from the headers a hosting platform (Vercel, etc.) sets on
// incoming requests. Falls back through a couple of common header names.
// Takes just the headers (not the whole Request), so server pages can use it too:
// they get headers from `headers()` in next/headers, but have no Request object.
export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headers.get("x-real-ip");
}

// A "private" IP only exists inside your own machine or home/campus network, so no
// geolocation service can look it up.
function isPrivateIp(ip: string): boolean {
  return ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("::ffff:127.");
}

// ipwho.is is free and needs no API key, which is fine for a hobby project.
// (We tried ipapi.co first, but its free quota runs out fast when a whole campus shares one IP.)
export async function lookupHomeLocation(ip: string | null): Promise<HomeLocation> {
  // During local development the browser's IP is "::1" (localhost). But the server is running
  // on your own laptop, so asking ipwho.is with NO ip ("who am I?") returns your laptop's public
  // IP location, which is the same place you are. In production, the real visitor IP is used.
  const url = !ip || isPrivateIp(ip) ? "https://ipwho.is/" : `https://ipwho.is/${ip}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000), // don't let a slow lookup hang the request
    });
    if (!response.ok) return FALLBACK_LOCATION;

    const data = await response.json();
    if (!data.success || !data.city || !data.country_code) return FALLBACK_LOCATION;

    return {
      city: data.city,
      region: data.region ?? "",
      countryCode: data.country_code,
      currency: currencyForCountry(data.country_code),
    };
  } catch {
    return FALLBACK_LOCATION; // never break the page over this
  }
}

// Exact coordinates (from the browser's "share your location", with the user's permission) -> the
// town they're in. Far more accurate than the IP guess, which is the network's hub city: on one
// network it said Guwahati, on another Thadlaskein, for the same person.
// Uses OpenStreetMap's free Nominatim service. Its rules: say who you are (User-Agent) and at most
// one request per second, which a button click easily respects.
export async function reverseGeocode(lat: number, lng: number): Promise<HomeLocation | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "json", zoom: "10", "accept-language": "en" });
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { "User-Agent": "TripCanvas/1.0 (student trip planner)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data: { address?: Record<string, string> } = await response.json();
    const a = data.address;
    // A big city is "city"; smaller places are "town" or "village"; rural areas only a "county".
    const city = a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? a?.county;
    if (!a || !city || !a.country_code) return null;
    const countryCode = a.country_code.toUpperCase();
    return { city, region: a.state ?? "", countryCode, currency: currencyForCountry(countryCode) };
  } catch {
    return null;
  }
}
