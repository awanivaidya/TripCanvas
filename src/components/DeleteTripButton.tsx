"use client";
// The browser's confirm() popup doesn't fit our design, so the button asks
// "Sure?" itself: the first click arms it, the second click deletes.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
    router.push("/trips");
    router.refresh(); // re-fetch the trips list so the deleted trip disappears
  }

  return (
    <button
      onClick={handleClick}
      onBlur={() => setConfirming(false)} // clicking elsewhere cancels
      className={confirming ? buttonClass("danger", "sm") : `${buttonClass("ghost", "sm")} hover:text-danger-700`}
    >
      <Trash2 className="h-4 w-4" />
      {confirming ? "Click again to delete" : "Delete trip"}
    </button>
  );
}
