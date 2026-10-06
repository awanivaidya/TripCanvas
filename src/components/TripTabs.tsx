"use client";
// Switches between the day-by-day board and the "Getting there" (travel) panel, with the AI chat
// on the right. A server component (the trip page) can't hold `useState`, so this client
// component owns that state: the active tab, whether the chat is open, and how many times the
// board has changed.
import { useRef, useState } from "react";
import { CalendarDays, ChevronsLeft, MessageCircle, Route } from "lucide-react";
import type { BoardDay, ChatTurn } from "@/lib/schemas";
import { TripBoard, type BoardHandle } from "@/components/board/TripBoard";
import { TravelPanel, type TravelPanelData } from "@/components/TravelPanel";
import { ChatPanel } from "@/components/ChatPanel";

type Tab = "board" | "travel";

export function TripTabs({
  tripId,
  destination,
  initialDays,
  initialMessages,
  currency,
  travelers,
  sample = false,
  sampleTravel,
}: {
  tripId: string;
  destination: string;
  currency: string | null; // for the estimated cost on the board
  travelers: { adults: number; children: number }; // the same, to split hotel rooms per person
  initialDays: BoardDay[];
  initialMessages: ChatTurn[];
  sample?: boolean; // the public sample trip: see TripBoard's `sample`
  sampleTravel?: TravelPanelData; // the sample's ready-made "Getting there" routes (no AI call)
}) {
  const [tab, setTab] = useState<Tab>("board");
  const [chatOpen, setChatOpen] = useState(true);

  // The chat only PROPOSES changes. When the traveler clicks Apply, we hand the new days to the
  // board through this handle, and the board treats it like any other change: it saves it, checks
  // it, and Undo can take it back. (Before, the board was thrown away and rebuilt, which also threw
  // away its Undo history.)
  const boardRef = useRef<BoardHandle>(null);
  // Goes up by one on every board change. A proposal remembers the number from when it was made;
  // if the board changed since, applying it would overwrite those changes, so the chat says so.
  const [boardRevision, setBoardRevision] = useState(0);

  function applyAiChanges(days: BoardDay[]) {
    boardRef.current?.applyChange(days);
    setTab("board"); // so they see what changed
  }
  // Travel options cost an AI call, so we only load them once the user first opens that tab —
  // and from then on keep the panel mounted, so switching back and forth doesn't re-fetch.
  const [travelOpened, setTravelOpened] = useState(false);

  function openTab(next: Tab) {
    setTab(next);
    if (next === "travel") setTravelOpened(true);
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* A segmented control: two options in one pill, the active one raised on a card-colored chip. */}
        <div className="border-b border-sand-200 bg-paper px-6 py-2.5">
          <div className="inline-flex rounded-full bg-sand-100 p-1">
            <TabButton active={tab === "board"} onClick={() => openTab("board")}>
              <CalendarDays className="h-4 w-4" />
              Itinerary
            </TabButton>
            {/* "Getting there" is drafted by the AI when opened. The sample shows ready-made routes
                instead, and has no tab if it has none. */}
            {(!sample || sampleTravel) && (
              <TabButton active={tab === "travel"} onClick={() => openTab("travel")}>
                <Route className="h-4 w-4" />
                Getting there
              </TabButton>
            )}
          </div>
        </div>

        {/* Panels are hidden with CSS, not removed, so switching tabs doesn't reset the board
          or re-fetch the travel options. */}
        <div className={`min-h-0 flex-1 ${tab === "board" ? "" : "hidden"}`}>
          <TripBoard
            ref={boardRef}
            tripId={tripId}
            currency={currency}
            travelers={travelers}
            initialDays={initialDays}
            onChange={() => setBoardRevision((r) => r + 1)}
            sample={sample}
          />
        </div>
        {/* The board shows the destination photo behind it; the travel panel keeps a plain paper page. */}
        <div className={`min-h-0 flex-1 overflow-y-auto bg-paper ${tab === "travel" ? "" : "hidden"}`}>
          {travelOpened && <TravelPanel tripId={tripId} destination={destination} initialData={sampleTravel} />}
        </div>
      </div>

      {/* Collapsed, the chat shrinks to a slim bar on the right edge; click it to open it again.
          The panel is hidden with CSS (not removed), so a half-typed message isn't lost. */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Open chat"
          className="flex h-full w-12 shrink-0 cursor-pointer flex-col items-center gap-3 border-l border-sand-200 bg-paper/90 py-5 text-sm font-medium text-ink-soft backdrop-blur-md transition hover:bg-paper hover:text-clay-700"
        >
          <ChevronsLeft className="h-4 w-4" />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-600 text-white">
            <MessageCircle className="h-4 w-4" />
          </span>
          {/* writing-mode turns the text sideways, to fit the narrow bar */}
          <span className="[writing-mode:vertical-rl]">Chat with AI</span>
        </button>
      )}
      <div className={chatOpen ? "h-full" : "hidden"}>
        <ChatPanel
          tripId={tripId}
          initialMessages={initialMessages}
          boardRevision={boardRevision}
          onApply={applyAiChanges}
          onCollapse={() => setChatOpen(false)}
          sample={sample}
        />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
        active ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
