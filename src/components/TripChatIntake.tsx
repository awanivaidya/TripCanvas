"use client";
// A guided, chat-styled way to describe a trip, instead of one long form.
//
// The trick that keeps this simple: we DON'T let the AI freely decide the conversation.
// We drive it ourselves with a `step` state machine (destination -> [scope] -> [pick] -> [district] -> confirm
// -> dates -> [length] -> travelers -> origin -> transport -> interests -> diet -> budget -> review -> generating),
// and the AI is only called in to help with ONE thing: giving
// suggestions when the user says they're unsure. This keeps the flow predictable and fast,
// while still feeling like a conversation.
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addDays, formatDay, listTripDates, MAX_TRIP_DAYS } from "@/lib/dates";
import { CURRENCIES, currencyForCode } from "@/lib/currency";
import {
  ArrowUp,
  CalendarSearch,
  Check,
  Compass,
  Gem,
  House,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Pencil,
  PiggyBank,
  Plane,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/button";
import { DietPicker, TransportPicker, TravelerPicker, type Travelers } from "@/components/TripOptions";
import { EMPTY_DIET, describeDiet, isDietComplete, type Diet } from "@/lib/diet";
import { freeDaysFrom, type FreeStretch } from "@/lib/freeDates";
import type { TransportMode } from "@/lib/schemas";
import { describeTransport, describeTravelers } from "@/lib/travelers";

const INTEREST_OPTIONS = [
  "food", "culture", "history", "nature", "museums", "nightlife",
  "shopping", "adventure", "beaches", "art", "photography", "relaxing",
];

// "scope" only happens when the destination was vague ("beaches and relaxation"): we ask
// "within your country or abroad?" before suggesting places.
// "length" only happens when the user picked an AI-suggested start date: the AI suggests WHEN
// to go, and we then ask how many days they want, instead of letting the AI guess.
// "confirm" = "Just to check: Rapleng Valley, Meghalaya?", so a wrong guess about WHICH place
// (or which region) is caught before the whole trip is planned around it.
type Step =
  | "destination"
  | "scope"
  | "pick" // the AI suggested places: pick one OR SEVERAL (Paris + Amsterdam), or type another
  | "district" // the AI doesn't know where a small place is: ask instead of guessing
  | "confirm"
  | "dates"
  | "length"
  | "travelers"
  | "origin" // where they start from: the IP guess is only a suggestion
  | "transport"
  | "interests"
  | "diet" // what they eat: vegetarian, only some meats, halal, allergies...
  | "budget"
  | "review" // everything at a glance, with a "Change" button per answer, before planning
  | "generating";

// The questions an answer can belong to. Each user answer remembers its question, so it can get a
// "Change" button (the sub-steps, like "pick" or "length", belong to destination and dates).
type Question = "destination" | "dates" | "travelers" | "origin" | "transport" | "interests" | "diet" | "budget";

function questionOf(step: Step): Question | "review" | null {
  if (step === "scope" || step === "pick" || step === "district" || step === "confirm") return "destination";
  if (step === "length") return "dates";
  if (step === "generating") return null;
  return step;
}
type Scope = "domestic" | "international";

// One message in the transcript. "bot" messages can carry chips to click ("options"),
// and can show a small inline date-picker or interest/budget picker ("input").
type Option = { label: string; value: string; icon?: LucideIcon };
type Turn =
  | { from: "bot"; text: string }
  | { from: "user"; text: string; question?: Question }
  | { from: "bot-options"; text: string; options: Option[] };

// whitespace-pre-line: a "\n" in a message becomes a new line (the date suggestions use one per line).
const bubble = "max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed";
// The value of the "Use my exact location" chip (not a town name).
const EXACT_LOCATION = "__exact_location__";
// Steps answered with buttons only. They get a message box too, so the user can always just type.
const MESSAGE_STEPS: Step[] = ["dates", "length", "travelers", "transport", "interests", "diet", "budget", "review"];
// The small suggestion "chips" (places, dates, interests).
const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-surface px-4 py-1.5 text-sm text-ink " +
  "transition-all duration-200 hover:-translate-y-px hover:border-clay-500 hover:text-clay-700 hover:shadow-sm cursor-pointer";

// What GET /api/location returns.
type DetectedLocation = {
  detected: boolean;
  place: string | null;
  countryCode: string | null;
  currency: { code: string; symbol: string };
};

// The trip lengths offered as chips. When we know how many days they're free, only lengths that
// fit, plus "all of it" (a 9-day stretch offers 3, 5, 7 and 9).
function lengthChoices(freeDays: number | null): number[] {
  const usual = [3, 5, 7, 10, 14];
  if (!freeDays) return usual;
  const whole = Math.min(freeDays, MAX_TRIP_DAYS);
  return [...new Set([...usual.filter((days) => days <= whole), whole])].sort((a, b) => a - b);
}

// "IN" -> "India", using the browser's built-in list of country names.
function countryName(code: string | null): string | null {
  if (!code) return null;
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? null;
}

export function TripChatIntake() {
  const router = useRouter();

  const [turns, setTurns] = useState<Turn[]>([
    { from: "bot", text: "Hi! Let's plan your trip. Where do you want to go?" },
  ]);
  const [step, setStep] = useState<Step>("destination");
  const [textInput, setTextInput] = useState("");
  const [suggesting, setSuggesting] = useState(false); // true while we wait on the AI for chips
  const [error, setError] = useState<string | null>(null);

  // Collected answers, filled in as the conversation goes.
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripLength, setTripLength] = useState(""); // the number box in the "length" step
  const [interests, setInterests] = useState<string[]>([]);
  const [travelers, setTravelers] = useState<Travelers>({ adults: 1, children: 0 });
  const [transport, setTransport] = useState<TransportMode[]>([]); // [] = no preference
  // The AI's reading of their destination, waiting for "yes, that's right".
  const [pendingPlace, setPendingPlace] = useState("");
  const [origin, setOrigin] = useState(""); // the starting town they confirmed or typed
  const [budgetAmount, setBudgetAmount] = useState(""); // the number box in the "budget" step
  // What they said when their destination was vague, kept while we ask "within India or abroad?".
  const [vagueHint, setVagueHint] = useState("");
  // The "pick" step: the places the AI suggested, and the ones ticked so far (in click order).
  const [placeIdeas, setPlaceIdeas] = useState<string[]>([]);
  const [pickedPlaces, setPickedPlaces] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [diet, setDiet] = useState<Diet>(EMPTY_DIET);
  // Typed answers that aren't one of the chips: "ferry" for transport, "street art" for interests.
  const [transportNote, setTransportNote] = useState("");
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  // Where to go back to after changing an earlier answer: the review, or the question they were on.
  const [returnTo, setReturnTo] = useState<Step | null>(null);
  // Things they said they want to see or do ("see cherry blossoms"), passed on to the planner.
  const [wishes, setWishes] = useState<string[]>([]);
  // Google Calendar ("Find free dates"): is it connected (null = still checking), are we waiting
  // for the permission pop-up, the free stretches it found, and how many days in a row are free
  // from the start date they picked (null = unknown, or that day isn't free).
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [freeStretches, setFreeStretches] = useState<FreeStretch[] | null>(null);
  const [freeDays, setFreeDays] = useState<number | null>(null);
  const popupTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Where the user is, looked up live when the chat opens (see the effect below).
  const [location, setLocation] = useState<DetectedLocation | null>(null);
  // The currency dropdown. null = "not touched yet", so we show the detected currency. Keeping the
  // user's pick separate means a slow location lookup can never overwrite a choice they made.
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const currency = currencyForCode(pickedCurrency ?? location?.currency.code);

  // Detect the user's location once, when the chat first appears. It runs in the background while
  // they answer the first questions, so they never wait for it.
  useEffect(() => {
    fetch("/api/location")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DetectedLocation | null) => data && setLocation(data))
      .catch(() => {}); // no location is fine: the dropdown just starts at USD
    // Also in the background: has this user already connected their Google Calendar?
    fetch("/api/calendar")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { connected: boolean } | null) => setCalendarConnected(data?.connected ?? false))
      .catch(() => setCalendarConnected(false));
    // If the chat goes away while we're waiting for the pop-up, stop waiting.
    return () => {
      if (popupTimer.current) clearInterval(popupTimer.current);
    };
  }, []);

  // Auto-scroll to the newest message.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  function say(turn: Turn) {
    setTurns((t) => [...t, turn]);
  }

  // The user's answer bubble. `question` = which question it answers, for its "Change" button.
  function answer(text: string, question: Question) {
    say({ from: "user", text, question });
  }

  // Ask a question: the bot's message (with an optional lead-in, like "Great, Goa it is!"), then
  // the input for it.
  function ask(next: Step, leadIn = "") {
    const text = (question: string) => (leadIn ? `${leadIn} ${question}` : question);
    if (next === "origin") {
      // Two one-click answers: the browser's exact location (it asks permission), and the town
      // guessed from the internet connection, which is only the network's hub city: on one network
      // it said Guwahati, on another Thadlaskein. Or they type it.
      const options: Option[] = [{ label: "Use my exact location", value: EXACT_LOCATION, icon: LocateFixed }];
      if (location?.detected && location.place) {
        options.push({ label: `From ${location.place}`, value: location.place, icon: MapPin });
      }
      say({
        from: "bot-options",
        text: text(
          location?.detected && location.place
            ? `Where will you be starting from? Your connection suggests ${location.place}, but that's only a rough guess. Pick one, or type your town.`
            : "Where will you be starting from? Use your exact location, or type your town, e.g. “Dhing, Assam”.",
        ),
        options,
      });
    } else {
      const questions: Partial<Record<Step, string>> = {
        destination: "Where do you want to go? Name one place or several, or describe the kind of trip.",
        dates: "When do you want to go?",
        travelers: "Who's coming along?",
        transport: "How would you like to get there and back? Pick any (or none if you don't mind), or type something else.",
        interests: "What are you interested in? Pick any, or add your own.",
        diet: "What do you eat? I'll pick restaurants and food experiences that suit you.",
        budget: "What's your budget?",
        review: "Here's your trip. Does it all look right? Change anything you like, or I'll start planning.",
      };
      say({ from: "bot", text: text(questions[next] ?? "") });
    }
    setStep(next);
  }

  // A question is answered: ask the next one. But if they came here to CHANGE an earlier answer,
  // go back to where they were instead (the review, or the question they were answering).
  function goNext(next: Step, leadIn = "") {
    const target = returnTo ?? next;
    setReturnTo(null);
    ask(target, leadIn);
  }

  // "Change" on an earlier answer (or on a row of the review): ask that question again.
  // `leadIn`: what the bot says first (the message interpreter passes its own explanation).
  function changeAnswer(question: Question, leadIn = "Sure, let's change that.") {
    const current = questionOf(step);
    if (current === null) return; // planning already started
    // Remember where to come back to (unless they're already changing something, or it's this question).
    if (!returnTo && current !== question) setReturnTo(current);
    setError(null);
    setTextInput("");
    ask(question, leadIn);
  }

  // ---------- "say anything": a typed message at any step ----------

  // Their answers so far, as short text for the AI that reads free-typed messages.
  function describeAnswers(): Record<string, string> {
    const answers: Record<string, string> = {};
    if (destination) answers.destination = destination;
    if (startDate && endDate) {
      answers.dates = `${formatDay(startDate)} – ${formatDay(endDate)} ${endDate.slice(0, 4)} (${listTripDates(startDate, endDate).length} days)`;
    }
    if (origin) {
      answers.travelers = describeTravelers(travelers.adults, travelers.children);
      answers.origin = origin;
    }
    if (transport.length || transportNote) answers.transport = describeTravelChoice();
    if (interests.length) answers.interests = interests.join(", ");
    if (budget) answers.budget = budget;
    return answers;
  }

  // People don't always answer the question in front of them: at the budget question they type
  // "I want to see cherry blossoms", which is really about the DATES. A small AI call reads the
  // message (/api/trips/interpret) and we act on what it means: change just that one answer (and
  // come back here), answer their question, or note a wish for the planner.
  async function submitMessage(raw: string) {
    const text = raw.trim();
    const current = questionOf(step);
    if (!text || !current) return;
    say({ from: "user", text });
    setTextInput("");
    setSuggesting(true);
    setError(null);

    const response = await fetch("/api/trips/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, step: current, answers: describeAnswers() }),
    });
    const data = await response.json();
    setSuggesting(false);
    if (!response.ok) {
      setError(data.error ?? "I couldn't understand that. Try saying it another way.");
      return;
    }
    const wish: string | null = data.wish ?? null;
    if (wish) setWishes((list) => (list.includes(wish) ? list : [...list, wish]));

    // About the dates (a seasonal wish, or typed at the dates question itself): explain, then
    // suggest dates that fit. Only the dates change; every other answer stays.
    const aboutDates = data.kind === "change" ? data.change === "dates" : current === "dates" && data.kind === "answer";
    if (aboutDates) {
      // Come back to this question (or the review) once the new dates are chosen.
      if (current !== "dates" && !returnTo) setReturnTo(current);
      say({ from: "bot", text: data.reply });
      setStep("dates");
      await suggestDates(text);
      return;
    }
    if (data.kind === "change") {
      changeAnswer(data.change, data.reply);
      return;
    }

    // An answer typed in words: use it where we can, so the reply ("Adding hiking...") is true.
    if (data.kind === "answer") {
      if (current === "interests") addInterest(wish ?? text);
      if (current === "transport") setTransportNote(text);
      if (current === "diet") setDiet((d) => ({ ...d, note: text }));
      if (current === "budget") {
        // "around 1 lakh": a budget in their own words. (Their message is already in the chat.)
        setBudget(text);
        goNext("review", data.reply);
        return;
      }
    }
    say({ from: "bot", text: data.reply });
  }

  // ---------- step 1: destination ----------

  // Every answer goes to the AI, which tells us whether it's ONE specific place ("Goa" -> accept
  // it) or something vague ("beaches and relaxation" -> ask more, then suggest real places).
  // A vague answer is never saved as the destination: that's how the board ended up planning
  // Puri while "Getting there" picked Calangute for the same "beaches in india".
  async function submitDestination(raw: string) {
    const text = raw.trim();
    if (!text) return;
    answer(text, "destination");
    setTextInput("");
    await checkDestination(text);
  }

  // `userGaveDistrict`: they've already answered "which district?", so don't ask again.
  async function checkDestination(hint: string, scope?: Scope, userGaveDistrict = false) {
    setSuggesting(true);
    setError(null);
    const response = await fetch("/api/trips/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // origin = where they are ("Dhing, Assam, IN"), so "domestic" means THEIR country.
      body: JSON.stringify({ kind: "destination", hint, scope, origin: location?.place ?? undefined }),
    });
    const data = await response.json();
    setSuggesting(false);

    if (!response.ok) {
      setError(data.error ?? "Couldn't get suggestions");
      return;
    }

    // 1. They named one or more specific places. If the AI isn't sure where some of them are,
    //    ask the user (it guessed the wrong district before). Otherwise confirm what it understood.
    const unsure: string[] = data.unsurePlaces ?? [];
    if (data.place && unsure.length > 0 && !userGaveDistrict) {
      askDistrict(hint, unsure);
      return;
    }
    if (data.place) {
      confirmDestination(data.place);
      return;
    }

    const destinations: { label: string }[] = data.destinations ?? [];
    // 2. Vague, and we don't know yet if they want to stay in the country: ask.
    if (destinations.length === 0 && !scope) {
      askScope(hint);
      return;
    }
    if (destinations.length === 0) {
      say({ from: "bot", text: "Hmm, I couldn't think of places for that. Try naming a place, or describe it another way." });
      setStep("destination");
      return;
    }

    // 3. Vague but clear enough: suggest real places. Like the interests step, they can tick
    //    several ("Europe" -> Paris AND Amsterdam), or type their own.
    say({ from: "bot", text: `${data.message} Pick one or more, and add your own if you like.` });
    setPlaceIdeas(destinations.map((d) => d.label));
    setPickedPlaces([]);
    setStep("pick");
  }

  function togglePlace(place: string) {
    setPickedPlaces((current) =>
      current.includes(place) ? current.filter((p) => p !== place) : [...current, place],
    );
  }

  // Typed in the pick step: added to the list, already ticked. It's checked with the others below.
  function addPlace(raw: string) {
    const place = raw.trim();
    if (!place) return;
    setTextInput("");
    setPlaceIdeas((ideas) => (ideas.includes(place) ? ideas : [...ideas, place]));
    setPickedPlaces((picked) => (picked.includes(place) ? picked : [...picked, place]));
  }

  // The ticked places (suggested and typed) go to the AI together, like a typed destination: it
  // adds each one's region or country, asks about any place it doesn't know, and then checks with
  // the user ("Just to check: ...?"). The planner knows how to visit several places in one trip.
  async function confirmPlaces() {
    const places = pickedPlaces.join(" & ");
    answer(places, "destination");
    await checkDestination(places);
  }

  function askScope(hint: string) {
    setVagueHint(hint);
    const country = countryName(location?.countryCode ?? null);
    say({
      from: "bot-options",
      text: "Sounds lovely! Do you want to stay in the country or go abroad?",
      options: [
        { label: country ? `Within ${country}` : "In my country", value: "domestic", icon: House },
        { label: "Abroad", value: "international", icon: Plane },
      ],
    });
    setStep("scope");
  }

  function askDistrict(hint: string, places: string[]) {
    setVagueHint(hint); // kept, so their answer can be added to what they first said
    const list = places.join(" and ");
    say({
      from: "bot",
      text: `I don't know exactly where ${list} ${places.length === 1 ? "is" : "are"}, and I'd rather not guess. Which district or nearby town ${places.length === 1 ? "is it" : "are they"} in? (e.g. “East Khasi Hills” or “near Shillong”)`,
    });
    setStep("district");
  }

  async function submitDistrict(raw: string) {
    const district = raw.trim();
    if (!district) return;
    answer(district, "destination");
    setTextInput("");
    await checkDestination(`${vagueHint} (the traveler says it's in: ${district})`, undefined, true);
  }

  function confirmDestination(place: string) {
    setPendingPlace(place);
    say({
      from: "bot-options",
      text: `Just to check: you want to visit ${place}?`,
      options: [
        { label: "Yes, that's right", value: "yes", icon: Check },
        { label: "Not quite", value: "no", icon: Pencil },
      ],
    });
    setStep("confirm");
  }

  function acceptDestination(value: string) {
    setDestination(value);
    goNext("dates", `Great, ${value} it is!`);
  }

  // ---------- step 2: dates ----------

  async function submitDatesUnsure(hint: string) {
    answer(hint, "dates");
    await suggestDates(hint);
  }

  // Ask the AI for good start dates, each with WHY it's a good time (the weather, cherry blossoms,
  // prices, crowds...) and its downside. `hint` is what they said they want.
  // `free`: the free stretches from their calendar. The AI must then pick start dates inside them.
  async function suggestDates(hint: string, free?: FreeStretch[]) {
    setSuggesting(true);
    setError(null);
    const response = await fetch("/api/trips/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "dates", hint, destination, freeRanges: free?.map(({ start, end }) => ({ start, end })) }),
    });
    const data = await response.json();
    setSuggesting(false);

    if (!response.ok) {
      // The AI failed, but the free stretches are facts we already have: offer those as they are.
      if (free) {
        say({
          from: "bot-options",
          text: "Pick the stretch you'd like to travel in, or choose your own dates.",
          options: free.map((s) => ({ label: `From ${formatDay(s.start)} · ${s.days} days free`, value: s.start })),
        });
        return;
      }
      setError(data.error ?? "Couldn't get suggestions");
      return;
    }
    const startDates: { label: string; startDate: string; reason: string }[] = data.startDates ?? [];
    // How long they're free from each date is worked out here in code, never by the AI.
    const freeNote = (date: string) => {
      const days = free ? freeDaysFrom(free, date) : null;
      return days ? ` (you're free for ${days} day${days === 1 ? "" : "s"} from then)` : "";
    };
    say({
      from: "bot-options",
      // One line per suggestion with its reason; the chips below stay short.
      text: [
        data.message,
        ...startDates.map((d) => `• ${d.label}: ${d.reason}${freeNote(d.startDate)}`),
        "Pick one, or choose your own dates.",
      ].join("\n"),
      options: startDates.map((d) => ({ label: d.label, value: d.startDate })),
    });
  }

  // ---------- Google Calendar: when are they free? ----------

  // The "Find free dates in my Google Calendar" button.
  function checkCalendar() {
    answer("Find free dates in my Google Calendar", "dates");
    if (calendarConnected) {
      findFreeDates();
      return;
    }
    // Not connected yet: Google's permission screen, in a small pop-up, so this chat (and every
    // answer in it) stays as it is. It has to be opened right here, in the click itself: a window
    // opened later (after waiting for something) gets blocked by the browser as an unwanted pop-up.
    const popup = window.open("/calendar/connect", "tripcanvas-calendar", "width=520,height=720");
    if (!popup) {
      say({ from: "bot", text: "Your browser blocked the pop-up. Allow pop-ups for this site and try again, or pick your dates yourself." });
      return;
    }
    setConnecting(true);
    // When the pop-up closes, ask our server whether access was given. (Simpler and safer than the
    // pop-up telling us: it works even if the user just closes the window.)
    popupTimer.current = setInterval(async () => {
      if (!popup.closed) return;
      clearInterval(popupTimer.current!);
      setConnecting(false);
      const status = await fetch("/api/calendar")
        .then((response) => response.json())
        .catch(() => null);
      if (status?.connected) {
        setCalendarConnected(true);
        findFreeDates();
      } else {
        say({ from: "bot", text: "I didn't get access to your calendar, so nothing changed. Pick your dates above, or try again." });
      }
    }, 700);
  }

  // Ask our server for the free stretches (it asks Google for busy times only), show them, then
  // let the AI say which of them are the best time for this destination.
  async function findFreeDates() {
    setSuggesting(true);
    setError(null);
    // The browser's time zone ("Asia/Kolkata"): a "free day" means a day where they live.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch(`/api/calendar/free?tz=${encodeURIComponent(timeZone)}`).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    setSuggesting(false);

    if (!response?.ok || !data) {
      setError(data?.error ?? "Couldn't reach Google Calendar. Try again in a moment.");
      return;
    }
    if (!data.connected) {
      setCalendarConnected(false); // access was removed in their Google account
      say({ from: "bot", text: "I no longer have access to your calendar. Click the button again to reconnect it." });
      return;
    }
    const stretches: FreeStretch[] = data.stretches;
    if (stretches.length === 0) {
      say({ from: "bot", text: "Your calendar has something on every day for the next 6 months, so I couldn't find a free stretch. Pick your dates above." });
      return;
    }

    setFreeStretches(stretches);
    const describe = (s: FreeStretch) =>
      s.days === 1 ? `• ${formatDay(s.start)} (1 day)` : `• ${formatDay(s.start)} – ${formatDay(s.end)} (${s.days} days)`;
    say({
      from: "bot",
      text: [
        "I checked your Google Calendar for the next 6 months (only whether you're busy, never what your events are). Your longest free stretches:",
        ...stretches.map(describe),
      ].join("\n"),
    });
    const wishText = wishes.length ? ` I also want to: ${wishes.join("; ")}.` : "";
    await suggestDates(`Times I'm free according to my calendar.${wishText}`, stretches);
  }

  // The user picked one of the AI's suggested start dates. Ask how long the trip should be.
  function askTripLength(start: string) {
    // Changing the dates of a trip they've already described: keep its length, change only when it
    // starts. (They can still pick an exact range with the date boxes.)
    const keepDays = returnTo && startDate && endDate ? listTripDates(startDate, endDate).length : 0;
    // If we know their calendar: how many days in a row are free from this date (null = it's busy).
    const free = freeStretches ? freeDaysFrom(freeStretches, start) : null;
    setFreeDays(free);
    if (keepDays) {
      const overlap = free !== null && keepDays > free ? ` (your calendar is only free for ${free} of them)` : "";
      acceptDates(start, addDays(start, keepDays - 1), `New dates: from ${formatDay(start)}, keeping your ${keepDays} days${overlap}.`);
      return;
    }
    setStartDate(start);
    const opening = free
      ? `You're free for ${free} day${free === 1 ? "" : "s"} from ${formatDay(start)}.`
      : freeStretches
        ? `Heads up: your calendar has something on ${formatDay(start)}.`
        : "Nice choice!";
    say({
      from: "bot",
      text: `${opening} How many days do you want to go for? (1–${MAX_TRIP_DAYS}, pick one or type any number)`,
    });
    setStep("length");
  }

  function chooseTripLength(days: number) {
    if (!Number.isInteger(days) || days < 1 || days > MAX_TRIP_DAYS) {
      setError(`Please pick between 1 and ${MAX_TRIP_DAYS} days.`);
      return;
    }
    setError(null);
    answer(`${days} day${days === 1 ? "" : "s"}`, "dates");
    // Longer than they're free? Their choice, but say so.
    const over = freeDays !== null && days > freeDays ? days - freeDays : 0;
    const warning = over
      ? `Got it, ${days} days. That's ${over} day${over === 1 ? "" : "s"} more than you're free, so it overlaps something in your calendar.`
      : undefined;
    // A 3-day trip starting Oct 10 ends Oct 12, so we add (days - 1).
    acceptDates(startDate, addDays(startDate, days - 1), warning);
  }

  function acceptDates(start: string, end: string, leadIn?: string) {
    setStartDate(start);
    setEndDate(end);
    const days = listTripDates(start, end).length;
    goNext("travelers", leadIn ?? `Got it, ${days} day${days === 1 ? "" : "s"}.`);
  }

  // ---------- step 3: who's travelling, and how ----------

  function confirmTravelers() {
    answer(describeTravelers(travelers.adults, travelers.children), "travelers");
    goNext("origin");
  }

  function acceptOrigin(value: string, leadIn = "") {
    setOrigin(value);
    goNext("transport", leadIn);
  }

  // Ask the browser where we are (it asks the user's permission first), then our server turns the
  // coordinates into a town. Far more accurate than the guess from the internet connection.
  function findExactLocation() {
    const failed = (reason: string) => {
      setSuggesting(false);
      say({ from: "bot", text: `${reason} Type your town instead, e.g. “Guwahati, Assam”.` });
    };
    if (!navigator.geolocation) return failed("Your browser can't share its location.");

    setSuggesting(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const response = await fetch(`/api/location?lat=${coords.latitude}&lng=${coords.longitude}`).catch(() => null);
        const data = response?.ok ? await response.json() : null;
        if (!data?.place) return failed("I couldn't find a town for your location.");
        setSuggesting(false);
        acceptOrigin(data.place, `Found you: ${data.place}.`);
      },
      () => failed("I couldn't get your location (the browser may have blocked it)."),
      { timeout: 10000 },
    );
  }

  function submitOrigin(raw: string) {
    const town = raw.trim();
    if (!town) return;
    answer(town, "origin");
    setTextInput("");
    acceptOrigin(town);
  }

  // The picked modes plus anything typed ("ferry", "our own car"). A typed answer goes to the
  // planner as a note, since the modes themselves are a fixed list.
  function describeTravelChoice(): string {
    const modes = transport.length ? describeTransport(transport) : transportNote.trim() ? "" : "No preference";
    const text = [modes, transportNote.trim()].filter(Boolean).join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function confirmTransport() {
    answer(describeTravelChoice(), "transport");
    goNext("interests");
  }

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest],
    );
  }

  // A typed interest ("street art") becomes a chip of its own, already ticked.
  function addInterest(value: string = interestInput) {
    const interest = value.trim().toLowerCase();
    if (!interest) return;
    setInterestInput("");
    if (!INTEREST_OPTIONS.includes(interest) && !customInterests.includes(interest)) {
      setCustomInterests((list) => [...list, interest]);
    }
    setInterests((list) => (list.includes(interest) ? list : [...list, interest]));
  }

  function confirmInterests() {
    answer(interests.length ? interests.join(", ") : "no particular interests", "interests");
    goNext("diet", "Nice.");
  }

  function confirmDiet() {
    answer(describeDiet(diet), "diet");
    goNext("budget", "Got it. Last thing:");
  }

  // ---------- step 4: budget -> review -> generate ----------

  // The number box: turn the amount into a clear sentence for the AI, e.g.
  // "₹25,000 total for the whole trip (INR)". toLocaleString adds the thousands separators.
  function submitBudgetAmount() {
    const amount = Number(budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // Indian numbers are grouped as 25,00,000; everywhere else as 2,500,000.
    const formatted = Math.round(amount).toLocaleString(currency.code === "INR" ? "en-IN" : "en-US");
    chooseBudget(`${currency.symbol}${formatted} total for the whole trip (${currency.code})`);
  }

  // `value` is either a chip ("Budget-friendly" / "Luxury") or an amount from the number box.
  // Then the review: one last look at every answer before the AI plans the trip.
  function chooseBudget(value: string) {
    setBudget(value);
    answer(value, "budget");
    goNext("review");
  }

  async function generate() {
    // The conversation so far, saved with the trip so the chat continues on the trip page.
    const transcript = turns.map((turn) => ({
      role: turn.from === "user" ? "user" : "assistant",
      content: turn.text,
    }));

    say({ from: "user", text: "Looks good, plan my trip" });
    say({ from: "bot", text: "Perfect. Planning your trip now…" });
    setStep("generating");
    setError(null);

    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination,
        startDate,
        endDate,
        origin: origin || undefined,
        adults: travelers.adults,
        children: travelers.children,
        transport,
        budget,
        currency: currency.code, // costs in the itinerary use this currency
        transcript,
        interests,
        dietary: describeDiet(diet), // every meal is planned around it
        // A travel wish that isn't one of the fixed modes ("ferry", "our own car").
        // ...and the things they said they want to see or do ("see cherry blossoms").
        notes: [
          transportNote.trim() ? `Getting there: ${transportNote.trim()}` : "",
          wishes.length ? `They especially want to: ${wishes.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join(". "),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Something went wrong");
      setStep("review"); // let them try again (or change something) without losing their answers
      return;
    }
    router.push(`/trips/${data.id}`);
  }

  // ---------- render ----------

  return (
    <div className="flex h-[72vh] min-h-[520px] animate-scale-in flex-col overflow-hidden rounded-3xl bg-surface shadow-xl shadow-shade/5 ring-1 ring-sand-200">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        {turns.map((turn, i) => (
          <TurnBubble
            key={i}
            turn={turn}
            onOptionClick={handleOptionClick}
            // No changes once planning has started.
            onChange={step === "generating" ? undefined : changeAnswer}
          />
        ))}

        {suggesting && (
          <BotRow>
            <TypingDots />
          </BotRow>
        )}
        {step === "generating" && (
          <BotRow>
            <div className={`${bubble} flex items-center gap-2 rounded-tl-md bg-sand-50 text-ink-soft`}>
              <LoaderCircle className="h-4 w-4 animate-spin text-clay-600" />
              {listTripDates(startDate, endDate).length > 10
                ? "Long trips are planned in parts, so this can take a few minutes."
                : "Planning your trip. This takes 10 to 30 seconds."}
            </div>
          </BotRow>
        )}
        {error && (
          <p className="flex animate-fade-in items-start gap-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="max-h-[60%] space-y-3 overflow-y-auto border-t border-sand-100 bg-paper/60 p-4">
        {renderInputArea()}
        {/* "Say anything": on the steps that only have buttons, a box for whatever is on their mind.
            (The destination, district and origin steps already have a text box of their own.) */}
        {MESSAGE_STEPS.includes(step) && (
          <TextRow
            value={textInput}
            onChange={setTextInput}
            onSubmit={submitMessage}
            placeholder="Or just tell me, e.g. “I want to see cherry blossoms”"
            disabled={suggesting}
            autoFocus={false}
          />
        )}
      </div>
    </div>
  );

  // A click on a chip (yes/no, scope, home town or start-date suggestion).
  function handleOptionClick(option: Option) {
    const question = questionOf(step);
    if (question && question !== "review") answer(option.label, question);
    if (step === "origin") {
      if (option.value === EXACT_LOCATION) findExactLocation();
      else acceptOrigin(option.value);
    } else if (step === "confirm") {
      if (option.value === "yes") {
        acceptDestination(pendingPlace);
      } else {
        say({
          from: "bot",
          text: "No problem. Type the places again with the state or region, e.g. “Hampi, Karnataka”, or add the ones I missed.",
        });
        setStep("destination");
      }
    } else if (step === "scope") {
      checkDestination(vagueHint, option.value as Scope); // now suggest places in that scope
    } else if (step === "dates") {
      askTripLength(option.value);
    }
  }

  function renderInputArea() {
    // In the "scope" and "confirm" steps they can also just type (a place, or a correction).
    if (step === "destination" || step === "scope" || step === "confirm") {
      return (
        <TextRow
          value={textInput}
          onChange={setTextInput}
          onSubmit={submitDestination}
          placeholder="Kyoto, “Amalfi Coast, Italy”, or “not sure”"
          disabled={suggesting}
        />
      );
    }

    if (step === "pick") {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {placeIdeas.map((place) => {
              const selected = pickedPlaces.includes(place);
              return (
                <button
                  key={place}
                  onClick={() => togglePlace(place)}
                  aria-pressed={selected}
                  className={`${chip} ${selected ? "border-clay-600 bg-clay-600 text-white hover:text-white" : ""}`}
                >
                  <MapPin className="h-4 w-4" />
                  {place}
                </button>
              );
            })}
          </div>
          <button onClick={confirmPlaces} disabled={pickedPlaces.length === 0} className={buttonClass("primary", "md")}>
            {pickedPlaces.length > 1 ? `Visit these ${pickedPlaces.length} places` : "Continue"}
          </button>
          <TextRow
            value={textInput}
            onChange={setTextInput}
            onSubmit={addPlace}
            placeholder="Add a place of your own, e.g. Lisbon"
            disabled={suggesting}
          />
        </div>
      );
    }

    if (step === "dates") {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${inputClass} w-auto`}
            />
            <span className="text-sm text-ink-faint">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${inputClass} w-auto`}
            />
            <button
              disabled={!startDate || !endDate}
              onClick={() => {
                answer(`${startDate} to ${endDate}`, "dates");
                acceptDates(startDate, endDate);
              }}
              className={buttonClass("primary", "md")}
            >
              Confirm
            </button>
          </div>
          <div className="flex flex-col items-start gap-2">
            {/* Looks at their Google Calendar for days with nothing on (busy/free only). The first
                time, Google's permission screen opens in a pop-up. */}
            <button
              disabled={suggesting || connecting}
              onClick={checkCalendar}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-clay-700 hover:text-clay-600 disabled:opacity-40"
            >
              <CalendarSearch className="h-4 w-4" />
              {connecting ? "Waiting for Google’s permission window…" : "Find free dates in my Google Calendar"}
            </button>
            <button
              disabled={suggesting}
              onClick={() => submitDatesUnsure("Not sure, suggest a good cheap time to go")}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-clay-700 hover:text-clay-600 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Not sure? Suggest good (cheap) dates
            </button>
          </div>
        </div>
      );
    }

    if (step === "length") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          {lengthChoices(freeDays).map((days) => (
            <button key={days} onClick={() => chooseTripLength(days)} className={chip}>
              {days} days
            </button>
          ))}
          <span className="px-1 text-sm text-ink-faint">or</span>
          <input
            type="number"
            min={1}
            max={MAX_TRIP_DAYS}
            value={tripLength}
            onChange={(e) => setTripLength(e.target.value)}
            placeholder="Days"
            className={`${inputClass} w-24`}
          />
          <button
            disabled={!tripLength}
            onClick={() => chooseTripLength(Number(tripLength))}
            className={buttonClass("primary", "md")}
          >
            Confirm
          </button>
        </div>
      );
    }

    if (step === "district") {
      return (
        <TextRow
          value={textInput}
          onChange={setTextInput}
          onSubmit={submitDistrict}
          placeholder="District or nearby town, e.g. East Khasi Hills"
          disabled={suggesting}
        />
      );
    }

    if (step === "origin") {
      return (
        <TextRow
          value={textInput}
          onChange={setTextInput}
          onSubmit={submitOrigin}
          placeholder="Your town, e.g. Dhing, Assam"
        />
      );
    }

    if (step === "travelers") {
      return (
        <div className="space-y-3">
          <TravelerPicker value={travelers} onChange={setTravelers} />
          <button onClick={confirmTravelers} className={buttonClass("primary", "md")}>
            Continue
          </button>
        </div>
      );
    }

    if (step === "transport") {
      return (
        <div className="space-y-3">
          <TransportPicker value={transport} onChange={setTransport} />
          <input
            value={transportNote}
            onChange={(e) => setTransportNote(e.target.value)}
            maxLength={100}
            placeholder="Anything else? e.g. “ferry”, “our own car”"
            className={inputClass}
          />
          <button onClick={confirmTransport} className={buttonClass("primary", "md")}>
            {transport.length || transportNote.trim() ? "Continue" : "No preference, continue"}
          </button>
        </div>
      );
    }

    if (step === "interests") {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[...INTEREST_OPTIONS, ...customInterests].map((interest) => {
              const selected = interests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  aria-pressed={selected}
                  className={`${chip} capitalize ${
                    selected ? "border-clay-600 bg-clay-600 text-white hover:text-white" : ""
                  }`}
                >
                  {interest}
                </button>
              );
            })}
          </div>
          {/* Their own interest. A <form>, so pressing Enter adds it. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addInterest();
            }}
            className="flex gap-2"
          >
            <input
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              maxLength={40}
              placeholder="Add your own, e.g. street art, K-pop"
              className={inputClass}
            />
            <button type="submit" disabled={!interestInput.trim()} className={buttonClass("secondary", "md")}>
              Add
            </button>
          </form>
          <button onClick={confirmInterests} className={buttonClass("primary", "md")}>
            Continue
          </button>
        </div>
      );
    }

    if (step === "diet") {
      return (
        <div className="space-y-4">
          <DietPicker value={diet} onChange={setDiet} />
          <button onClick={confirmDiet} disabled={!isDietComplete(diet)} className={buttonClass("primary", "md")}>
            Continue
          </button>
        </div>
      );
    }

    if (step === "budget") {
      return (
        <div className="space-y-3">
          {/* Where we think they are, and the currency for all prices (they can change it). */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              Starting from {origin}
            </span>
            <label className="flex items-center gap-2">
              Prices in
              <select
                value={currency.code}
                onChange={(e) => setPickedCurrency(e.target.value)}
                className="cursor-pointer rounded-full border border-sand-300 bg-surface px-2.5 py-1 text-xs text-ink focus:border-clay-500 focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol === c.code ? c.code : `${c.symbol} ${c.code}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BudgetOption
              icon={PiggyBank}
              title="Budget-friendly"
              text="Homestays, trains, street food"
              onClick={() => chooseBudget("Budget-friendly")}
            />
            <BudgetOption
              icon={Gem}
              title="Luxury"
              text="Boutique hotels, flights, fine dining"
              onClick={() => chooseBudget("Luxury")}
            />
          </div>
          {/* Or type an exact amount. A <form> means pressing Enter submits it too. */}
          <form
            onSubmit={(e) => {
              e.preventDefault(); // stop the browser from reloading the page
              submitBudgetAmount();
            }}
            className="flex items-center gap-2"
          >
            <div className="flex flex-1 items-center rounded-xl border border-sand-200 bg-surface pl-3.5 transition focus-within:border-clay-500 focus-within:ring-4 focus-within:ring-clay-100">
              <span className="text-sm font-medium text-ink-soft">{currency.symbol}</span>
              <input
                type="number"
                inputMode="numeric" // shows a number keypad on phones
                min={1}
                step={1}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="Or type a total budget, e.g. 25000"
                className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-ink-faint"
              />
            </div>
            <button type="submit" disabled={!(Number(budgetAmount) > 0)} className={buttonClass("primary", "md")}>
              Confirm
            </button>
          </form>
        </div>
      );
    }

    if (step === "review") {
      const days = listTripDates(startDate, endDate).length;
      const rows: { question: Question; label: string; value: string }[] = [
        { question: "destination", label: "Where", value: destination },
        { question: "dates", label: "When", value: `${formatDay(startDate)} – ${formatDay(endDate)} · ${days} day${days === 1 ? "" : "s"}` },
        { question: "travelers", label: "Who", value: describeTravelers(travelers.adults, travelers.children) },
        { question: "origin", label: "From", value: origin || "Not given" },
        { question: "transport", label: "Travel", value: describeTravelChoice() },
        { question: "interests", label: "Interests", value: interests.join(", ") || "Nothing in particular" },
        { question: "diet", label: "Food", value: describeDiet(diet) },
        { question: "budget", label: "Budget", value: `${budget} · prices in ${currency.code}` },
      ];
      return (
        <div className="space-y-3">
          <dl className="divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-surface">
            {rows.map((row) => (
              <div key={row.question} className="flex items-center gap-3 px-4 py-2">
                <dt className="w-20 shrink-0 text-xs font-medium uppercase tracking-wider text-ink-faint">{row.label}</dt>
                <dd className="min-w-0 flex-1 text-sm text-ink">{row.value}</dd>
                <button onClick={() => changeAnswer(row.question)} className={buttonClass("ghost", "sm")}>
                  <Pencil className="h-3.5 w-3.5" />
                  Change
                </button>
              </div>
            ))}
          </dl>
          {wishes.length > 0 && (
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-ink">I&rsquo;ll also include:</span> {wishes.join(", ")}
            </p>
          )}
          <button onClick={generate} className={buttonClass("primary", "md")}>
            <Sparkles className="h-4 w-4" />
            Looks good, plan my trip
          </button>
        </div>
      );
    }

    return null; // "generating": no input while we wait
  }
}

// The assistant's avatar + whatever goes next to it (a bubble, the typing dots...).
function BotRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex animate-fade-up items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay-600 text-white">
        <Compass className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">{children}</div>
    </div>
  );
}

// Three bouncing dots while the AI thinks, like a messaging app. Each dot starts a little later.
function TypingDots() {
  return (
    <div className={`${bubble} flex items-center gap-1 rounded-tl-md bg-sand-50 py-3.5`} aria-label="Thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-2 w-2 animate-bounce rounded-full bg-ink-faint"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

// One chat bubble: bot text, user text, or bot text + clickable option chips.
// animate-fade-up makes each new message rise in gently.
// A user answer has a "Change" button (shown on hover on a computer, always on a phone).
function TurnBubble({
  turn,
  onOptionClick,
  onChange,
}: {
  turn: Turn;
  onOptionClick: (option: Option) => void;
  onChange?: (question: Question) => void;
}) {
  if (turn.from === "user") {
    const question = turn.question;
    return (
      <div className="group flex animate-fade-up items-center justify-end gap-2">
        {question && onChange && (
          <button
            onClick={() => onChange(question)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-faint transition hover:text-clay-700 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Change
          </button>
        )}
        <div className={`${bubble} rounded-tr-md bg-clay-600 text-white`}>{turn.text}</div>
      </div>
    );
  }

  return (
    <BotRow>
      <div className={`${bubble} rounded-tl-md bg-sand-50 text-ink`}>{turn.text}</div>
      {turn.from === "bot-options" && (
        <div className="flex flex-wrap gap-2">
          {turn.options.map((option) => (
            <button key={option.value} onClick={() => onOptionClick(option)} className={chip}>
              {option.icon && <option.icon className="h-4 w-4 text-clay-600" />}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </BotRow>
  );
}

// A big clickable card for the two budget styles.
function BudgetOption({
  icon: Icon,
  title,
  text,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-sand-200 bg-surface p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-clay-500 hover:shadow-md"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay-50 text-clay-600 transition-colors group-hover:bg-clay-600 group-hover:text-white">
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-faint">{text}</span>
      </span>
    </button>
  );
}

// A text input + send button, used for the free-text destination step.
function TextRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean; // false for the extra message box, so it doesn't steal the cursor
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="flex items-center gap-2 rounded-full border border-sand-200 bg-surface p-1.5 pl-5 transition focus-within:border-clay-500 focus-within:ring-4 focus-within:ring-clay-100"
    >
      <input
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-clay-600 text-white transition hover:bg-clay-700 dark:hover:bg-clay-500 disabled:opacity-40"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </form>
  );
}
