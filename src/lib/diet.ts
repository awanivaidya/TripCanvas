// What the traveler eats, picked in the trip chat. Saved on the trip as ONE sentence
// (describeDiet), which the planner and the chat AI read, and which the review shows.
// No database imports, so both the browser (the chat) and the server (prompts) can use it.

export type DietBase = "everything" | "vegetarian" | "vegan" | "some";

export type Diet = {
  base: DietBase;
  allowed: string[]; // vegetarian: eggs OK? "some": exactly which meats/fish they eat
  needs: string[]; // halal, gluten-free, allergies...
  note: string; // anything typed: "no mushrooms"
};

export const EMPTY_DIET: Diet = { base: "everything", allowed: [], needs: [], note: "" };

export const DIET_BASES: { value: DietBase; label: string }[] = [
  { value: "everything", label: "I eat everything" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "some", label: "Non-veg, but only some things" },
];

// The chips under "Which of these are OK?". A vegetarian only gets asked about eggs.
export function allowedChoices(base: DietBase): string[] {
  if (base === "vegetarian") return ["eggs"];
  if (base === "some") return ["eggs", "chicken", "fish & seafood", "mutton / lamb", "beef", "pork"];
  return [];
}

export const DIET_NEEDS = ["halal", "Jain (no onion or garlic)", "gluten-free", "nut allergy", "lactose-free", "not spicy"];

// "Some things" with nothing ticked doesn't say anything yet: the chat waits for a pick.
export function isDietComplete(diet: Diet): boolean {
  return diet.base !== "some" || diet.allowed.length > 0;
}

// e.g. "Non-vegetarian, but only: chicken, fish & seafood, eggs (no other meat or fish). Also: halal."
export function describeDiet(diet: Diet): string {
  const parts: string[] = [];
  if (diet.base === "everything") parts.push("Eats everything");
  if (diet.base === "vegan") parts.push("Vegan (no meat, fish, eggs, dairy or honey)");
  if (diet.base === "vegetarian") {
    parts.push(diet.allowed.includes("eggs") ? "Vegetarian, eggs OK (no meat or fish)" : "Vegetarian (no meat, fish or eggs)");
  }
  if (diet.base === "some") parts.push(`Non-vegetarian, but only: ${diet.allowed.join(", ")} (no other meat or fish)`);
  if (diet.needs.length) parts.push(`Also: ${diet.needs.join(", ")}`);
  if (diet.note.trim()) parts.push(`Notes: ${diet.note.trim()}`);
  return `${parts.join(". ")}.`;
}
