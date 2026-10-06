// The sample trip on /sample: a finished itinerary anyone can open and play with, without signing
// in. It's plain data written by hand, not made by the AI, so it costs no tokens and is always
// there, even when the free AI plan's daily limit is used up.
//
// It follows every rule the planner follows: local times with the right time zone changes, no
// flight numbers, 3 hours at the airport before a long flight, 30-minute hotel check-ins,
// 2+ days per city, flying home from the last city, opening hours, and a club-free evening before
// the early start. Costs are per person in INR (¥100 ≈ ₹58); hotels are per room per night.
import type { BoardActivity, BoardDay, ChatTurn } from "@/lib/schemas";
import type { TravelPanelData } from "@/components/TravelPanel";

export const SAMPLE_TRIP = {
  title: "Cherry Blossom Japan: Tokyo, Kyoto & Nara",
  destination: "Tokyo & Kyoto, Japan",
  origin: "New Delhi, Delhi, IN",
  startDate: "2027-03-27",
  endDate: "2027-04-02",
  adults: 2,
  children: 0,
  currency: "INR",
};

// Each place's Google Maps id, so its card opens the Google panel (photo, rating, hours, map).
// Looked up once with the Places Text Search and checked by name and address. Google's terms let us
// keep place ids; coordinates may only be kept 30 days, so the sample has none.
const GOOGLE_PLACE_IDS: Record<string, string> = {
  "Hotel Gracery Shinjuku": "ChIJF-U1JdiMGGARaay7KIrrtZ0",
  "Shinjuku Gyoen National Garden": "ChIJPyOTG8KMGGARh_IXobWxHmo",
  "Meiji Jingu": "ChIJ5SZMmreMGGARcz8QSTiJyo8",
  "Harajuku: Takeshita Street & Omotesando": "ChIJlVne8bqMGGARtX5O6ojMvsI",
  "Shibuya Sky": "ChIJ4Rr2JWiLGGARcyRSHuZ-9G8",
  "Dinner at Uobei Shibuya Dogenzaka": "ChIJaTXpw6mMGGARP-d-_tbssVE",
  "Breakfast at Tsukiji Outer Market": "ChIJW2cLzSGLGGARXAKXv6EkbqI",
  "teamLab Planets TOKYO": "ChIJSeco5wiJGGARItbTS8lQ5G0",
  "Lunch at Asakusa Daikokuya Tempura": "ChIJ79EaJsGOGGARHgsoZXYMZO0",
  "Senso-ji & Nakamise Street": "ChIJ8T1GpMGOGGARDYGSgpooDWw",
  "Ueno Park": "ChIJw2qQRZuOGGARWmROEiM2y7E",
  "Dinner in Omoide Yokocho": "ChIJP9eKBdeMGGAR0zzBXJNVj5A",
  "Drinks in Golden Gai": "ChIJr7mGZdmMGGARjxoMFeHApXE",
  "Breakfast at Hotel Gracery Shinjuku": "ChIJF-U1JdiMGGARaay7KIrrtZ0",
  "Hotel Granvia Kyoto": "ChIJaVi89K4IAWAR4vsxLc_WnbM",
  "Lunch at Kyoto Ramen Koji": "ChIJKRpFOpoIAWARfMEVANUDooo",
  "Fushimi Inari Taisha": "ChIJIW0uPRUPAWAR6eI6dRzKGns",
  "Maruyama Park & Gion walk": "ChIJm6JortwIAWARS811J4oNJus",
  "Dinner at Ganko Takasegawa Nijoen": "ChIJKfXPTY0IAWARm2KX__UTOYY",
  "Breakfast at Hotel Granvia Kyoto": "ChIJaVi89K4IAWAR4vsxLc_WnbM",
  "Arashiyama Bamboo Grove": "ChIJrYtcv-urAWAR3XzWvXv8n_s",
  "Tenryu-ji": "ChIJk54PuAGqAWARwEgz_9o-nM0",
  "Iwatayama Monkey Park": "ChIJvUn7bqsAAWARsjQHQ7CTNBs",
  "Lunch at Arashiyama Yoshimura": "ChIJSwnVXlUHAWARuTjqE7BrW88",
  "Kinkaku-ji": "ChIJvUbrwCCoAWARX2QiHCsn5A4",
  "Nishiki Market": "ChIJT8uMzZwIAWARnGzsARCjnrY",
  "Drinks at Bar K6": "ChIJ2b4ClM0HAWARHNrgkqv5EDI",
  "Nara Park": "ChIJYWCMvZY5AWARVnREV_OsbPk",
  "Todai-ji": "ChIJ3XYIepA5AWARjzzVnT-skPg",
  "Lunch at Kamameshi Shizuka": "ChIJfxW-0Y85AWARgYpZZjfh330",
  "Kasuga Taisha": "ChIJ1Wqwa8A5AWARlpXjgoPnl0w",
  "Naramachi old town walk": "ChIJI2QoZ4s5AWARyT7_h6JrcIg",
  "Ninenzaka & Sannenzaka": "ChIJr_gZonkIAWARB1xyACZNUKM",
  "Dinner at Pontocho Robin": "ChIJ6aqQVJMIAWARCkhCadiYros",
  "Lunch at Tsunahachi Tsunohazuan": "ChIJme51XdqMGGAR5HuQeZwe7EY",
  "Dinner at Ramen Muraji": "ChIJRe4VdeoIAWARdODM6PBbZuM",
};

type Extra = Partial<Omit<BoardActivity, "id" | "title" | "category" | "startTime" | "durationMin">>;

// One card. Fields not given are null, like a card the AI planned without them.
function card(
  title: string,
  category: BoardActivity["category"],
  startTime: string,
  durationMin: number,
  extra: Extra = {},
): Omit<BoardActivity, "id"> {
  return {
    title,
    category,
    startTime,
    durationMin,
    description: null,
    locationName: null,
    estCost: null,
    openTime: null,
    closeTime: null,
    journeyStep: null,
    arrivalTime: null,
    googlePlaceId: GOOGLE_PLACE_IDS[title] ?? null, // the Google Maps panel (see below)
    lat: null,
    lng: null,
    ...extra,
  };
}

const DAYS: Omit<BoardActivity, "id">[][] = [
  // Day 1 · Sat 27 Mar: the overnight flight
  [
    card("Cab: Home → Indira Gandhi International Airport", "transport", "16:30", 60, {
      arrivalTime: "17:30",
      journeyStep: 1,
      locationName: "New Delhi",
      estCost: "~₹350",
      description: "Leaves 3 hours for check-in and security before an international flight.",
    }),
    card("Flight: Delhi (DEL) → Tokyo Haneda (HND), Air India", "transport", "20:30", 470, {
      arrivalTime: "07:50",
      journeyStep: 2,
      locationName: "Indira Gandhi International Airport → Haneda Airport",
      estCost: "~₹38,000",
      description: "Overnight, about 7h50m. Clocks go forward 3h30m, so you land at 07:50 Tokyo time with a full day ahead.",
    }),
  ],
  // Day 2 · Sun 28 Mar: Tokyo, west side
  [
    card("Train: Haneda Airport → Shinjuku (Keikyu Line + JR Yamanote Line)", "transport", "08:30", 60, {
      arrivalTime: "09:30",
      journeyStep: 3,
      locationName: "Haneda Airport → Shinjuku Station",
      estCost: "~₹400",
    }),
    card("Hotel Gracery Shinjuku", "lodging", "09:45", 30, {
      locationName: "Kabukicho, Shinjuku, Tokyo",
      estCost: "~₹15,000 per night",
      description: "Drop your bags (check-in from 14:00). Central, next to the station, with the famous Godzilla head on the roof.",
    }),
    card("Shinjuku Gyoen National Garden", "sight", "10:30", 120, {
      locationName: "Shinjuku, Tokyo",
      estCost: "~₹290",
      openTime: "09:00",
      closeTime: "17:30",
      description: "Over 1,000 cherry trees, near full bloom in late March: the best first sight for photography.",
    }),
    card("Lunch at Tsunahachi Tsunohazuan", "food", "12:45", 60, {
      locationName: "Shinjuku, Tokyo",
      estCost: "~₹1,400",
      description: "Tsunahachi has made tempura in Shinjuku since 1923: the lunch set is good value.",
    }),
    card("Meiji Jingu", "sight", "14:15", 90, {
      locationName: "Harajuku, Tokyo",
      estCost: "free",
      description: "A forest shrine one stop from Shinjuku, quiet after the city.",
    }),
    card("Harajuku: Takeshita Street & Omotesando", "activity", "16:00", 90, {
      locationName: "Harajuku, Tokyo",
      estCost: "free",
      description: "Street fashion and crêpes, then the tree-lined avenue of designer architecture.",
    }),
    card("Shibuya Sky", "sight", "17:45", 75, {
      locationName: "Shibuya, Tokyo",
      estCost: "~₹1,800",
      openTime: "10:00",
      closeTime: "22:30",
      description: "Open-air rooftop over the Shibuya Crossing. Sunset is around 17:55: book this time slot ahead.",
    }),
    card("Dinner at Uobei Shibuya Dogenzaka", "food", "19:15", 60, {
      locationName: "Shibuya, Tokyo",
      estCost: "~₹900",
      description: "Sushi by touchscreen, delivered on a mini bullet train. A light first evening after the overnight flight.",
    }),
  ],
  // Day 3 · Mon 29 Mar: Tokyo, east side
  [
    card("Breakfast at Tsukiji Outer Market", "food", "08:15", 75, {
      locationName: "Tsukiji, Tokyo",
      estCost: "~₹1,200",
      description: "Tamagoyaki, grilled scallops and fresh sushi from the stalls (open Monday; most close on Sundays).",
    }),
    card("teamLab Planets TOKYO", "activity", "10:00", 120, {
      locationName: "Toyosu, Tokyo",
      estCost: "~₹2,300",
      description: "Walk barefoot through water and light installations. Book a timed ticket.",
    }),
    card("Lunch at Asakusa Daikokuya Tempura", "food", "12:45", 60, {
      locationName: "Asakusa, Tokyo",
      estCost: "~₹1,300",
      description: "The Asakusa classic: tendon (a tempura rice bowl) in a dark sesame-oil sauce.",
    }),
    card("Senso-ji & Nakamise Street", "sight", "14:00", 90, {
      locationName: "Asakusa, Tokyo",
      estCost: "free",
      description: "Tokyo's oldest temple, reached through a lane of snack and souvenir stalls.",
    }),
    card("Ueno Park", "sight", "15:45", 75, {
      locationName: "Ueno, Tokyo",
      estCost: "free",
      description: "Tokyo's best-known cherry blossom avenue, two stops from Asakusa.",
    }),
    card("Rest at Hotel Gracery Shinjuku", "free", "17:30", 60, {
      locationName: "Shinjuku, Tokyo",
      description: "An hour off before the evening.",
    }),
    card("Dinner in Omoide Yokocho", "food", "18:45", 75, {
      locationName: "Shinjuku, Tokyo",
      estCost: "~₹1,500",
      description: "Yakitori grilled in tiny bars along a lantern-lit alley: great for photos.",
    }),
    card("Drinks in Golden Gai", "activity", "20:15", 90, {
      locationName: "Shinjuku, Tokyo",
      estCost: "~₹1,500",
      description: "Some 200 bars with a handful of seats each. Many charge a small cover; look for the ones that welcome visitors.",
    }),
  ],
  // Day 4 · Tue 30 Mar: bullet train to Kyoto
  [
    card("Breakfast at Hotel Gracery Shinjuku", "food", "07:45", 45, {
      locationName: "Shinjuku, Tokyo",
      estCost: "~₹1,500",
    }),
    card("Train: Shinjuku → Tokyo Station (JR Chuo Line)", "transport", "09:00", 15, {
      arrivalTime: "09:15",
      journeyStep: 4,
      locationName: "Shinjuku Station → Tokyo Station",
      estCost: "~₹120",
    }),
    card("Shinkansen: Tokyo → Kyoto (Nozomi)", "transport", "09:30", 135, {
      arrivalTime: "11:45",
      journeyStep: 5,
      locationName: "Tokyo Station → Kyoto Station",
      estCost: "~₹8,000",
      description: "2h15m at up to 285 km/h. Sit on the right (seat E) for a view of Mount Fuji on a clear day.",
    }),
    card("Hotel Granvia Kyoto", "lodging", "12:00", 30, {
      locationName: "Kyoto Station, Kyoto",
      estCost: "~₹18,000 per night",
      description: "Inside Kyoto Station: every day trip starts downstairs. Bags first, check-in from 15:00.",
    }),
    card("Lunch at Kyoto Ramen Koji", "food", "12:45", 60, {
      locationName: "Kyoto Station, Kyoto",
      estCost: "~₹900",
      description: "Eight ramen shops from around Japan on the station's 10th floor.",
    }),
    card("Fushimi Inari Taisha", "sight", "14:00", 150, {
      locationName: "Fushimi, Kyoto",
      estCost: "free",
      description: "Thousands of red torii gates up the mountain. Five minutes by train; the crowds thin out after the first half hour of climbing.",
    }),
    card("Maruyama Park & Gion walk", "sight", "17:00", 90, {
      locationName: "Gion, Kyoto",
      estCost: "free",
      description: "Kyoto's famous weeping cherry tree, then the wooden teahouses of Hanamikoji at dusk.",
    }),
    card("Dinner at Ganko Takasegawa Nijoen", "food", "18:45", 90, {
      locationName: "Kiyamachi, Kyoto",
      estCost: "~₹3,500",
      description: "Kaiseki and sushi in a 400-year-old villa garden: the trip's splurge dinner.",
    }),
  ],
  // Day 5 · Wed 31 Mar: Arashiyama and the Golden Pavilion
  [
    card("Breakfast at Hotel Granvia Kyoto", "food", "07:30", 45, {
      locationName: "Kyoto Station, Kyoto",
      estCost: "~₹1,800",
    }),
    card("Train: Kyoto → Saga-Arashiyama (JR Sagano Line)", "transport", "08:30", 20, {
      arrivalTime: "08:50",
      locationName: "Kyoto Station → Saga-Arashiyama Station",
      estCost: "~₹140",
    }),
    card("Arashiyama Bamboo Grove", "sight", "09:00", 45, {
      locationName: "Arashiyama, Kyoto",
      estCost: "free",
      description: "Early, before the tour groups: the light through the bamboo is best for photos now.",
    }),
    card("Tenryu-ji", "sight", "09:50", 60, {
      locationName: "Arashiyama, Kyoto",
      estCost: "~₹290",
      openTime: "08:30",
      closeTime: "17:00",
      description: "A UNESCO-listed Zen temple with a 700-year-old pond garden.",
    }),
    card("Iwatayama Monkey Park", "activity", "11:00", 75, {
      locationName: "Arashiyama, Kyoto",
      estCost: "~₹460",
      openTime: "09:00",
      closeTime: "16:00",
      description: "A 20-minute climb to wild macaques and a view over all of Kyoto.",
    }),
    card("Lunch at Arashiyama Yoshimura", "food", "12:30", 60, {
      locationName: "Arashiyama, Kyoto",
      estCost: "~₹1,300",
      description: "Handmade soba with a view of the Togetsukyo Bridge.",
    }),
    card("Taxi: Arashiyama → Kinkaku-ji", "transport", "13:45", 25, {
      arrivalTime: "14:10",
      locationName: "Arashiyama → Kinkaku-ji",
      estCost: "~₹1,000",
    }),
    card("Kinkaku-ji", "sight", "14:15", 60, {
      locationName: "Kita, Kyoto",
      estCost: "~₹290",
      openTime: "09:00",
      closeTime: "17:00",
      description: "The Golden Pavilion, mirrored in its pond.",
    }),
    card("Nishiki Market", "activity", "15:45", 75, {
      locationName: "Nakagyo, Kyoto",
      estCost: "~₹800",
      openTime: "10:00",
      closeTime: "18:00",
      description: "Snack your way down “Kyoto's Kitchen”: pickles, tofu doughnuts, matcha everything.",
    }),
    card("Rest at Hotel Granvia Kyoto", "free", "17:15", 75, {
      locationName: "Kyoto Station, Kyoto",
    }),
    card("Dinner at Ramen Muraji", "food", "19:00", 60, {
      locationName: "Nakagyo, Kyoto",
      estCost: "~₹1,100",
      description: "Creamy chicken-broth ramen, a short walk from the evening's bar.",
    }),
    card("Drinks at Bar K6", "activity", "20:30", 90, {
      locationName: "Kiyamachi, Kyoto",
      estCost: "~₹2,000",
      description: "A relaxed, much-loved whisky bar: Kyoto nightlife is bars, not clubs.",
    }),
  ],
  // Day 6 · Thu 1 Apr: a day in Nara
  [
    card("Breakfast at Hotel Granvia Kyoto", "food", "08:00", 45, {
      locationName: "Kyoto Station, Kyoto",
      estCost: "~₹1,800",
    }),
    card("Train: Kyoto → Nara (Kintetsu Limited Express)", "transport", "09:00", 35, {
      arrivalTime: "09:35",
      locationName: "Kyoto Station → Kintetsu-Nara Station",
      estCost: "~₹740",
    }),
    card("Nara Park", "sight", "09:45", 45, {
      locationName: "Nara",
      estCost: "~₹120",
      description: "Over 1,000 free-roaming deer that bow for crackers (sold in the park).",
    }),
    card("Todai-ji", "sight", "10:30", 90, {
      locationName: "Nara",
      estCost: "~₹460",
      openTime: "07:30",
      closeTime: "17:30",
      description: "A 15-metre bronze Buddha inside one of the world's largest wooden buildings.",
    }),
    card("Lunch at Kamameshi Shizuka", "food", "12:15", 60, {
      locationName: "Nara",
      estCost: "~₹1,300",
      description: "Kamameshi: rice and toppings cooked in an iron pot, a Nara speciality since 1949.",
    }),
    card("Kasuga Taisha", "sight", "13:30", 60, {
      locationName: "Nara",
      estCost: "~₹290",
      description: "A shrine lined with 3,000 stone and bronze lanterns.",
    }),
    card("Naramachi old town walk", "activity", "14:45", 75, {
      locationName: "Nara",
      estCost: "free",
      description: "Lanes of restored merchant houses, craft shops and cafés.",
    }),
    card("Train: Nara → Kyoto (Kintetsu Limited Express)", "transport", "16:15", 35, {
      arrivalTime: "16:50",
      locationName: "Kintetsu-Nara Station → Kyoto Station",
      estCost: "~₹740",
    }),
    card("Ninenzaka & Sannenzaka", "activity", "17:15", 75, {
      locationName: "Higashiyama, Kyoto",
      estCost: "free",
      description: "Stone-paved slopes below Kiyomizu-dera, at their most photogenic in the evening light.",
    }),
    card("Dinner at Pontocho Robin", "food", "18:45", 90, {
      locationName: "Pontocho, Kyoto",
      estCost: "~₹3,500",
      description: "A riverside dinner on the last night, on a terrace over the Kamo River.",
    }),
    card("Evening walk along the Kamo River", "free", "20:30", 45, {
      locationName: "Kyoto",
      estCost: "free",
      description: "An early night: the train to the airport leaves at 07:45.",
    }),
  ],
  // Day 7 · Fri 2 Apr: home, from the nearest big airport to the last city
  [
    card("Breakfast at Hotel Granvia Kyoto", "food", "06:45", 45, {
      locationName: "Kyoto Station, Kyoto",
      estCost: "~₹1,800",
    }),
    card("Train: Kyoto → Kansai Airport (JR Haruka Express)", "transport", "07:45", 75, {
      arrivalTime: "09:00",
      journeyStep: 6,
      locationName: "Kyoto Station → Kansai International Airport",
      estCost: "~₹2,100",
      description: "Straight from the hotel's station. Kansai is the nearest big airport to Kyoto, so no going back to Tokyo.",
    }),
    card("Flight: Osaka Kansai (KIX) → Bangkok (BKK), Thai Airways", "transport", "12:00", 390, {
      arrivalTime: "16:30",
      journeyStep: 7,
      locationName: "Kansai International Airport → Suvarnabhumi Airport",
      estCost: "~₹18,000",
      description: "6h30m. Clocks go back 2 hours.",
    }),
    card("Flight: Bangkok (BKK) → Delhi (DEL), Thai Airways", "transport", "18:45", 255, {
      arrivalTime: "21:30",
      journeyStep: 8,
      locationName: "Suvarnabhumi Airport → Indira Gandhi International Airport",
      estCost: "~₹12,000",
      description: "A 2h15m connection in Bangkok, then 4h15m. Clocks go back 1h30m.",
    }),
    card("Cab: Indira Gandhi International Airport → Home", "transport", "22:15", 60, {
      arrivalTime: "23:15",
      journeyStep: 9,
      locationName: "New Delhi",
      estCost: "~₹350",
    }),
  ],
];

// The board's shape, with stable ids ("sample-d2-c3") so React and dnd-kit can track the cards.
export function sampleBoardDays(): BoardDay[] {
  return DAYS.map((cards, dayIndex) => {
    const date = new Date(`${SAMPLE_TRIP.startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dayIndex);
    return {
      id: `sample-d${dayIndex + 1}`,
      date: date.toISOString(),
      index: dayIndex,
      activities: cards.map((c, i) => ({ ...c, id: `sample-d${dayIndex + 1}-c${i + 1}` })),
    };
  });
}

// An example of what the trip chat does, shown in the chat panel. Labelled as an example on the
// page: it wasn't a live conversation.
export const SAMPLE_CHAT: ChatTurn[] = [
  {
    role: "assistant",
    content: "This is a sample trip, so the chat is an example. On your own trips you type a change and I propose it; nothing changes until you press Apply.",
  },
  { role: "user", content: "Can we see the bamboo grove before the crowds?" },
  {
    role: "assistant",
    content: "It's already first thing on day 5: the train to Arashiyama leaves at 08:30, so you're in the grove by 09:00, ahead of most tour groups.",
  },
  { role: "user", content: "Make day 3 lighter" },
  {
    role: "assistant",
    content: "I'd drop teamLab Planets and start at Tsukiji an hour later, keeping the temple, the park and the evening in Shinjuku. Want me to apply that?",
  },
];

// The "Getting there" tab: three ways from New Delhi to Tokyo, written in advance like the rest of
// the sample. The fastest one is the route the itinerary above uses. Times are local ("+1" = the
// next day), with the same rules as the planner: airline names but no flight numbers, and the cab
// reaching the airport 3 hours before a long flight. Prices per person in INR.
export const SAMPLE_TRAVEL: TravelPanelData = {
  home: { city: "New Delhi", region: "Delhi", countryCode: "IN", currency: { code: "INR", symbol: "₹" } },
  from: SAMPLE_TRIP.origin,
  results: {
    note: "A sample: these routes were written in advance as an example. On your own trips they're drafted by AI from your home town, so times and prices are estimates to check before you book.",
    routes: [
      {
        label: "Fastest: direct overnight flight",
        totalDurationLabel: "13h 30m",
        legs: [
          { mode: "cab", from: "Home, New Delhi", to: "Delhi Airport (DEL)", service: "Uber or Ola", departTime: "16:30", arriveTime: "17:30", durationLabel: "1h", price: 350 },
          { mode: "flight", from: "Delhi Airport (DEL)", to: "Tokyo Haneda (HND)", service: "Air India, non-stop", departTime: "20:30", arriveTime: "07:50 +1", durationLabel: "7h 50m", price: 38000 },
          { mode: "train", from: "Tokyo Haneda (HND)", to: "Shinjuku, Tokyo", service: "Keikyu Line + JR Yamanote Line", departTime: "08:30", arriveTime: "09:30", durationLabel: "1h", price: 400 },
        ],
      },
      {
        label: "Cheaper: one stop in Bangkok",
        totalDurationLabel: "18h 45m",
        legs: [
          { mode: "cab", from: "Home, New Delhi", to: "Delhi Airport (DEL)", service: "Uber or Ola", departTime: "19:45", arriveTime: "20:45", durationLabel: "1h", price: 350 },
          { mode: "flight", from: "Delhi Airport (DEL)", to: "Bangkok (BKK)", service: "Thai Airways", departTime: "23:55", arriveTime: "05:35 +1", durationLabel: "4h 10m", price: 9000 },
          { mode: "flight", from: "Bangkok (BKK)", to: "Tokyo Narita (NRT)", service: "Thai Airways", departTime: "07:45", arriveTime: "15:45", durationLabel: "6h", price: 19000 },
          { mode: "train", from: "Tokyo Narita (NRT)", to: "Shinjuku, Tokyo", service: "Narita Express", departTime: "16:30", arriveTime: "18:00", durationLabel: "1h 30m", price: 1900 },
        ],
      },
      {
        label: "Cheapest: low-cost via Kuala Lumpur",
        totalDurationLabel: "21h 30m",
        legs: [
          { mode: "cab", from: "Home, New Delhi", to: "Delhi Airport (DEL)", service: "Uber or Ola", departTime: "19:15", arriveTime: "20:15", durationLabel: "1h", price: 350 },
          { mode: "flight", from: "Delhi Airport (DEL)", to: "Kuala Lumpur (KUL)", service: "AirAsia X", departTime: "23:15", arriveTime: "07:15 +1", durationLabel: "5h 30m", price: 10000 },
          { mode: "flight", from: "Kuala Lumpur (KUL)", to: "Tokyo Narita (NRT)", service: "AirAsia X", departTime: "10:45", arriveTime: "18:45", durationLabel: "7h", price: 14000 },
          { mode: "train", from: "Tokyo Narita (NRT)", to: "Ueno, Tokyo", service: "Keisei Skyliner", departTime: "19:30", arriveTime: "20:15", durationLabel: "45m", price: 1500 },
        ],
      },
    ],
  },
};
