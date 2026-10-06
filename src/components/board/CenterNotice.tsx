"use client";
// A message in the middle of the screen, on top of everything (even the edit dialog).
//   "checking": the AI is judging a change. No button; the board replaces it when the answer arrives.
//   "blocked":  the change didn't make sense and was NOT saved. The user closes it with OK.
import { Ban, LoaderCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export type Notice = { kind: "checking" | "blocked"; text: string };

export function CenterNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const blocked = notice.kind === "blocked";

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-shade/30 p-4 backdrop-blur-sm"
      onClick={blocked ? onClose : undefined}
    >
      <div
        role="alertdialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-scale-in rounded-3xl bg-surface p-7 text-center shadow-2xl"
      >
        {blocked ? (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-danger-700">
              <Ban className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 text-xl">Can&rsquo;t make that change</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{notice.text}</p>
            <button autoFocus onClick={onClose} className={`${buttonClass("dark", "md")} mt-6 w-full`}>
              Got it
            </button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2.5 text-sm text-ink-soft">
            <LoaderCircle className="h-5 w-5 animate-spin text-clay-600" />
            {notice.text}
          </p>
        )}
      </div>
    </div>
  );
}
