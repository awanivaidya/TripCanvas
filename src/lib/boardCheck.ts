// Every problem on the WHOLE board, card by card: the same instant checks that guard each change
// (clashes, opening hours, journey order, "can you get there in time?"), run over everything at
// once. The board shows each one as a warning on its card, so a mistake that's already there (an
// old trip, an edit from before a check existed) is visible, not hidden.
// One check is left out on purpose: the airport rule (2-3 hours before a flight). It's a preference, not an impossible
// plan, so it only appears when a change breaks it (the blocking message), never as a permanent
// warning on the card.
import type { BoardDay } from "@/lib/schemas";
import { findTimeProblem } from "@/lib/feasibility";
import { findPlaceProblems } from "@/lib/geo";

// card id -> what's wrong with it (the first problem found, to keep the warning short)
export function findBoardProblems(days: BoardDay[]): Map<string, string> {
  const problems = new Map<string, string>();
  const add = (cardId: string, message: string) => {
    if (!problems.has(cardId)) problems.set(cardId, message);
  };

  const inOrder = [...days].sort((a, b) => a.index - b.index);
  let highestStep: { step: number; title: string } | null = null;

  for (const day of inOrder) {
    for (const card of day.activities) {
      const timeProblem = findTimeProblem(card, day.activities, { flightBuffer: false });
      if (timeProblem) add(card.id, timeProblem);

      // Journey legs must count up through the trip: a leg numbered lower than one before it is
      // out of order.
      if (card.journeyStep !== null) {
        if (highestStep && card.journeyStep < highestStep.step) {
          add(card.id, `Journey step ${card.journeyStep} comes after step ${highestStep.step} (${highestStep.title}).`);
        } else {
          highestStep = { step: card.journeyStep, title: card.title };
        }
      }
    }
    for (const problem of findPlaceProblems(day.activities)) add(problem.cardId, problem.message);
  }
  return problems;
}
