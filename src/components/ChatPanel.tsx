"use client";
// The chat with the AI, next to the board. It starts with the conversation that created the
// trip (saved in the database), and the traveler can keep going: "make day 2 more relaxed",
// "add a trek on day 3", "what should I pack?". When the AI wants to change the plan, it only
// PROPOSES it: we show what would change ("Day 2: added Bomnal Café (13:00)") with Apply and
// Discard. Apply hands the new days to the board (`onApply`), which saves them like any other
// change, so Undo works on them too. Either way, the choice is noted in the saved chat.
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronsRight, Compass, TriangleAlert, X } from "lucide-react";
import type { BoardDay, ChatTurn } from "@/lib/schemas";
import { buttonClass } from "@/components/ui/button";

type Props = {
  tripId: string;
  initialMessages: ChatTurn[];
  boardRevision: number; // goes up on every board change (see TripTabs)
  onApply: (days: BoardDay[]) => void;
  onCollapse: () => void;
  // The public sample trip: the messages are an example, and typing asks you to sign in.
  sample?: boolean;
};

// The AI's latest suggested change, waiting for Apply or Discard. `revision` = the board's
// revision when it was made, to notice if the board changed in the meantime.
type Proposal = { days: BoardDay[]; changes: string[]; revision: number };

// Quick ideas shown above the text box, so it's obvious what you can ask.
const QUICK_PROMPTS = ["Make day 2 more relaxed", "Add a local food experience", "Find a cheaper hotel"];

const bubble = "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm leading-relaxed";

export function ChatPanel({ tripId, initialMessages, boardRevision, onApply, onCollapse, sample = false }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [deciding, setDeciding] = useState(false); // while the Apply/Discard note is being saved
  // The board changed after the proposal was made: applying it now would wipe those changes out.
  const stale = proposal !== null && proposal.revision !== boardRevision;
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the newest message in view.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, proposal]);

  // Note the traveler's choice in the saved chat, and show the note.
  async function decide(decision: "applied" | "discarded") {
    setDeciding(true);
    const response = await fetch(`/api/trips/${tripId}/chat/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    const data = response?.ok ? await response.json() : null;
    const note = data?.note ?? (decision === "applied" ? "Applied the change to your board." : "Discarded that change.");
    setMessages((m) => [...m, { role: "assistant", content: note }]);
    setProposal(null);
    setDeciding(false);
  }

  function applyProposal() {
    if (!proposal || stale) return;
    // Hide the card first: applying changes the board, which would make it look "out of date".
    setProposal(null);
    onApply(proposal.days); // the board saves it, checks it, and can undo it
    decide("applied");
  }

  // `message` defaults to what's typed in the box; a quick-prompt chip passes its own text.
  async function send(message: string = input) {
    const text = message.trim();
    if (!text || sending) return;
    if (sample) {
      setError("The chat works on your own trips. Sign in (it's free) to plan one and ask for changes.");
      return;
    }

    // A new message while a proposal is still waiting means "not that one": note it as discarded
    // first, so the saved chat (and the AI, next time) knows it never reached the board.
    if (proposal) await decide("discarded");

    // Show their message straight away (optimistic), like the board does with drags.
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);

    // If it fails, take their message back out and put it in the box again, so they can retry
    // without retyping. (The server only saves messages when everything worked.)
    function undo(reason: string) {
      setError(reason);
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    }

    try {
      const response = await fetch(`/api/trips/${tripId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      if (!response.ok) {
        undo(data.error ?? "Something went wrong");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      // null = the AI only answered, nothing to change. Otherwise: a proposal to Apply or Discard.
      if (data.days) setProposal({ days: data.days, changes: data.changes, revision: boardRevision });
    } catch {
      undo("Couldn't reach the server. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  return (
    // Frosted panel, like the day columns, so it matches the photo background.
    <aside className="flex h-full w-96 shrink-0 animate-slide-in flex-col border-l border-sand-200 bg-paper/90 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 border-b border-sand-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-600 text-white">
            <Compass className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-lg leading-tight">Trip assistant</h2>
            <p className="text-xs text-ink-faint">
              {sample ? "An example conversation" : "Describe a change, check it, then apply it"}
            </p>
          </div>
        </div>
        <button
          onClick={onCollapse}
          title="Collapse chat"
          aria-label="Collapse chat"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-faint transition hover:bg-sand-100 hover:text-ink"
        >
          <ChevronsRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex animate-fade-up justify-end">
              <p className={`${bubble} rounded-tr-md bg-clay-600 text-white`}>{m.content}</p>
            </div>
          ) : (
            <div key={i} className="flex animate-fade-up items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay-600 text-white">
                <Compass className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
              <p className={`${bubble} rounded-tl-md bg-surface text-ink shadow-sm ring-1 ring-sand-200`}>{m.content}</p>
            </div>
          ),
        )}
        {/* The AI's proposed change: what it does, then Apply or Discard. */}
        {proposal && (
          <div className="ml-9 animate-fade-up space-y-3 rounded-2xl border border-clay-100 bg-surface p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Proposed changes</p>
            <ul className="space-y-1.5 text-sm text-ink">
              {proposal.changes.map((change) => (
                <li key={change} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay-500" />
                  {change}
                </li>
              ))}
            </ul>
            {stale ? (
              <p className="flex items-start gap-1.5 text-xs text-danger-700">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                The board changed since this suggestion, so applying it would undo those changes. Ask again for a fresh one.
              </p>
            ) : (
              <p className="text-xs text-ink-faint">Nothing changes until you apply it, and you can undo it afterwards.</p>
            )}
            <div className="flex gap-2">
              <button onClick={applyProposal} disabled={stale || deciding} className={buttonClass("primary", "sm")}>
                <Check className="h-4 w-4" />
                Apply
              </button>
              <button onClick={() => decide("discarded")} disabled={deciding} className={buttonClass("ghost", "sm")}>
                <X className="h-4 w-4" />
                Discard
              </button>
            </div>
          </div>
        )}
        {sending && (
          // Three bouncing dots while the AI works, each one starting a little later.
          <div className="flex animate-fade-up items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-clay-600 text-white">
              <Compass className="h-3.5 w-3.5 animate-spin [animation-duration:3s]" strokeWidth={1.75} />
            </span>
            <span className="flex gap-1 rounded-3xl rounded-tl-md bg-surface px-4 py-3.5 shadow-sm ring-1 ring-sand-200">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mx-5 mb-2 flex animate-fade-in items-start gap-2 rounded-2xl bg-danger-50 p-3 text-sm text-danger-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="space-y-3 border-t border-sand-200 p-4">
        {!sending && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                className="cursor-pointer rounded-full border border-sand-300 bg-surface px-3 py-1 text-xs text-ink-soft transition hover:border-clay-500 hover:text-clay-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault(); // stop the browser from reloading the page
            send();
          }}
          className="flex items-end gap-2 rounded-3xl border border-sand-200 bg-surface p-1.5 pl-4 transition focus-within:border-clay-500 focus-within:ring-4 focus-within:ring-clay-100"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // Enter sends; Shift+Enter makes a new line (like most chat apps).
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask for a change, e.g. “add a trek on day 3”"
            disabled={sending}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-faint disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clay-600 text-white transition hover:bg-clay-700 dark:hover:bg-clay-500 disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </form>
        {!sample && (
          // Honest about the limits, so a slow or refused answer isn't a surprise.
          <p className="px-2 text-[11px] leading-snug text-ink-faint">
            Runs on a free AI plan: about one message a minute, and a daily limit shared by everyone.
          </p>
        )}
      </div>
    </aside>
  );
}
