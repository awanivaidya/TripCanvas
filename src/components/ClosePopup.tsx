"use client";
// Closes the small pop-up window once Google's permission screen is done. (A window can close
// itself only if a script opened it, which is how the trip chat opens this one.) The chat notices
// the pop-up has closed and carries on.
import { useEffect } from "react";

export function ClosePopup() {
  useEffect(() => {
    window.close();
  }, []);
  return null;
}
