"use client";
// "Delete my account": the same two-click pattern as DeleteTripButton (the first click arms it, the
// second deletes), with the consequences spelled out, because this one can't be undone.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    const response = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setError("Couldn't delete your account. Please try again.");
      setDeleting(false);
      setConfirming(false);
      return;
    }
    // A full page load (not router.push): the old session is gone, so start completely fresh.
    window.location.href = "/";
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        onBlur={() => !deleting && setConfirming(false)} // clicking elsewhere cancels
        disabled={deleting}
        className={confirming ? buttonClass("danger", "md") : `${buttonClass("ghost", "md")} hover:text-danger-700`}
      >
        <Trash2 className="h-4 w-4" />
        {deleting
          ? "Deleting…"
          : confirming
            ? "Click again: delete my account and all my trips"
            : "Delete my account and data"}
      </button>
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </div>
  );
}
