// Booking links for hotels.
//
// We build the link OURSELVES instead of asking the AI for one. AIs often invent URLs that look
// real but lead nowhere. A Booking.com *search* link always works, and it shows the matching
// hotel at the top of the results.
export function hotelBookingUrl(hotelName: string, location: string | null): string {
  const query = location ? `${hotelName}, ${location}` : hotelName;
  // encodeURIComponent makes the text safe inside a URL ("Taj Palace" -> "Taj%20Palace").
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}`;
}
