// Finds a scenic photo of the trip's destination, shown behind the itinerary board.
// We use Wikipedia's free API: no key needed, and most place articles have a lead photo.
// The URL comes from Wikipedia, never from the AI (models invent image links that 404).
export type PlacePhoto = {
  imageUrl: string;
  pageUrl: string; // the Wikipedia article, linked as the photo credit
};

// "Markham Valley, Rapleng Valley & Bamboo Trek, East Khasi Hills, Meghalaya, India" often has no
// article (small places aren't on Wikipedia). So we try, in order:
//   1. the whole destination
//   2. each piece on its own, most specific first ("Markham Valley", ..., "East Khasi Hills")
//   3. the state ("Meghalaya")
// A photo of the district or state is much better than no photo at all.
export async function findPlacePhoto(destination: string): Promise<PlacePhoto | null> {
  const whole = await searchPhoto(destination);
  if (whole) return whole;

  // Split on commas, "&" and "and"; drop the country (a photo of "India" says nothing).
  const pieces = destination
    .split(/,|&|\band\b/i)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 1 && !/^(india|in)$/i.test(piece));
  if (pieces.length < 2) return null;
  const state = pieces[pieces.length - 1];

  for (const piece of pieces) {
    // Search "Markham Valley Meghalaya", not just "Markham Valley": there's a Markham Valley in
    // Papua New Guinea too. And only accept an article whose TITLE names the piece, so a search
    // that finds something loosely related (a general "Sikkim" article) is skipped.
    const query = piece === state ? piece : `${piece} ${state}`;
    const photo = await searchPhoto(query, piece);
    if (photo) return photo;
  }
  return null;
}

// One Wikipedia search. `titleMustInclude`: only accept an article whose title contains it.
async function searchPhoto(query: string, titleMustInclude?: string): Promise<PlacePhoto | null> {
  // One request does two things: search for the best-matching articles ("generator=search")
  // and return each one's lead image ("prop=pageimages") at 1920px wide.
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "pageimages|info",
    piprop: "thumbnail",
    pithumbsize: "1920",
    inprop: "url",
  });

  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      // Wikipedia asks API users to say who they are.
      headers: { "User-Agent": "TripCanvas/1.0 (student trip planner)" },
      // Cache the answer for a day, so reloading the trip page doesn't ask Wikipedia again.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return null;

    const data = await response.json();
    type Page = { index: number; title: string; fullurl: string; thumbnail?: { source: string } };
    const pages: Page[] = Object.values(data.query?.pages ?? {});
    const wanted = titleMustInclude?.toLowerCase();

    // Best search match first. Skip SVGs: those are maps, flags and logos, not photos.
    const page = pages
      .sort((a, b) => a.index - b.index)
      .find(
        (p) =>
          p.thumbnail &&
          !p.thumbnail.source.toLowerCase().includes(".svg") &&
          (!wanted || p.title.toLowerCase().includes(wanted)),
      );
    if (!page?.thumbnail) return null;

    return { imageUrl: page.thumbnail.source, pageUrl: page.fullurl };
  } catch {
    return null; // no photo is fine: the page falls back to a plain gradient
  }
}
