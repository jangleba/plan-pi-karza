// Ocena decyzji zawodnika — czysta logika, bez UI.

import type { IQDecision, IQEvaluation, IQRating, IQScenario, IQTarget } from "./types";

export const RATING_LABELS: Record<IQRating, string> = {
  optimal: "Decyzja optymalna",
  safe: "Dobra i bezpieczna",
  risky: "Ryzykowna, ale logiczna",
  wrong: "Decyzja błędna",
};

const DEFAULT_RADIUS = 17;

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function bestTarget(scenario: IQScenario): IQTarget {
  return (
    scenario.targets.find((t) => t.rating === "optimal") ?? scenario.targets[0]
  );
}

export function matchTarget(
  scenario: IQScenario,
  decision: IQDecision,
): IQTarget | undefined {
  if (decision.targetId) {
    const byId = scenario.targets.find((t) => t.id === decision.targetId);
    if (byId) return byId;
  }
  let found: IQTarget | undefined;
  let bestDist = Infinity;
  for (const t of scenario.targets) {
    const d = dist(decision.x, decision.y, t.x, t.y);
    if (d <= (t.radius ?? DEFAULT_RADIUS) && d < bestDist) {
      bestDist = d;
      found = t;
    }
  }
  return found;
}

export function evaluateDecision(
  scenario: IQScenario,
  decision: IQDecision,
): IQEvaluation {
  const best = bestTarget(scenario);
  const matched = matchTarget(scenario, decision);
  if (!matched) {
    return {
      rating: "wrong",
      label: RATING_LABELS.wrong,
      explanation: scenario.missExplanation,
      consequence: scenario.missConsequence,
      best,
    };
  }
  return {
    rating: matched.rating,
    label: RATING_LABELS[matched.rating],
    explanation: matched.explanation,
    consequence: matched.consequence,
    best,
    matched,
  };
}
