// "/calendar/connected": where Google sends the pop-up back after the permission screen. Nothing to
// do here but close the pop-up; the chat in the main window checks whether access was given.
import { CalendarCheck } from "lucide-react";
import { ClosePopup } from "@/components/ClosePopup";

export default function CalendarConnectedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <ClosePopup />
      <div className="w-full max-w-sm space-y-3 rounded-3xl bg-surface p-7 text-center shadow-xl shadow-shade/5 ring-1 ring-sand-200">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-50 text-sage-600">
          <CalendarCheck className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h1 className="text-2xl">All set</h1>
        {/* Only seen if the window couldn't close itself. */}
        <p className="text-sm text-ink-soft">You can close this window and go back to your trip.</p>
      </div>
    </main>
  );
}
