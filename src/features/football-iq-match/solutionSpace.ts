/** Several good answers to one picture (rules v9).
 *
 * A good decision is described by its kind of solution: safe, forward, with risk or less
 * obvious. The kind comes from what the decision did in context (gain, rivals passed,
 * free lane, space, state after), never from being unusual on its own. The solution
 * map plays a spread of legal choices on the picture before a decision and lists which
 * kinds of good answer that picture really holds. Pure and deterministic.
 */
import { assessDecision, LANE_OPEN, type DecisionAssessment } from "./decisionAssessment";
import { chooseJourney } from "./journeyEngine";
import { sampleChoices } from "./playability";
import type { JourneyChoice, JourneySession } from "./journeyTypes";

export type SolutionKind = "safe" | "forward" | "risky" | "unusual";
export const solutionLabels: Record<SolutionKind, string> = {
  safe: "bezpieczne",
  forward: "do przodu",
  risky: "z ryzykiem",
  unusual: "mniej oczywiste",
};

/** The kind of a good decision, from what it did on the pitch; null for weaker ones. */
export function solutionKind(a: DecisionAssessment): SolutionKind | null {
  if (a.grade !== "good") return null;
  const f = a.facts;
  if (f.kind === "own") {
    if (f.switched) return "unusual";
    // A pass through a narrow lane or a carry with a rival close: it worked, but it was tight.
    if (f.intent === "pass" && f.passLane > 0 && f.passLane < LANE_OPEN && f.gain >= 8)
      return "risky";
    if (f.shot) return f.shot.metres > 16 ? "risky" : "forward";
    if (f.bypassed >= 1 || f.gain >= 8) return "forward";
    return "safe";
  }
  if (f.kind === "partner") {
    // Off the ball: running behind, dropping to offer, or widening to open space for others.
    if (f.start.y - f.end.y >= 6) return "forward";
    if (Math.abs(f.end.x - f.start.x) > Math.abs(f.end.y - f.start.y) + 2) return "unusual";
    return "safe";
  }
  if (f.kind === "rival") {
    if (f.intent === "press" || f.toBall <= 5) return "risky";
    if (f.intent === "mark") return "unusual";
    return "safe";
  }
  return "safe";
}

export type SolutionOption = {
  kind: SolutionKind;
  choice: JourneyChoice;
  assessment: DecisionAssessment;
};

/** The good answers the picture holds, one example per kind (in the order safe, forward,
 * risky, unusual). `before` is the picture just before a decision of TY. */
export function solutionMap(before: JourneySession): SolutionOption[] {
  const found = new Map<SolutionKind, SolutionOption>();
  for (const choice of sampleChoices(before)) {
    const next = chooseJourney(before, choice.id, 0, false);
    const assessment = assessDecision(next, next.decisions.length - 1);
    const kind = solutionKind(assessment);
    if (kind && !found.has(kind)) found.set(kind, { kind, choice, assessment });
  }
  return (["safe", "forward", "risky", "unusual"] as const)
    .map((k) => found.get(k))
    .filter((o): o is SolutionOption => !!o);
}

/** What a saved choice is, coarsely: the same action to the same player or 10 m cell.
 * The delivery does not count: a ground or a lofted ball to the same partner is one idea. */
export function classOfChoiceId(id: string): string | null {
  const m = /^attack9:[^:]+:([a-z]+):[^:]+:[^:]+:(-?[\d.]+):(-?[\d.]+):(.+)$/.exec(id);
  if (!m) return null;
  const where =
    m[4] === "space" ? `${Math.round(Number(m[2]) / 10)}:${Math.round(Number(m[3]) / 10)}` : m[4];
  return `${m[1]}:${where}`;
}

export type RetryVerdict = "another" | "same" | "weaker";
/** "Find another solution": the second answer counts only when it is good and it is a
 * different action or target than the first good one. */
export function retryVerdict(
  firstChoiceId: string,
  secondChoiceId: string,
  second: DecisionAssessment,
): RetryVerdict {
  if (second.grade !== "good") return "weaker";
  return classOfChoiceId(firstChoiceId) === classOfChoiceId(secondChoiceId) ? "same" : "another";
}
