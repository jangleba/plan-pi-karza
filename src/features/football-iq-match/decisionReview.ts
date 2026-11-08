/** Review of the player's decisions after a whole action: the grade the engine
 * gave, and a better ready-made option tried on the same picture.
 * Purely tactical: positions and moves, no explanations.
 */
import { choicePath, decisionOptions, type DecisionOption } from "./decisionOptions";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import type { JourneyChoice, JourneyQuality, JourneySession } from "./journeyTypes";
import type { PlannedAction } from "./types";

export const qualityLabels: Record<JourneyQuality, string> = {
  good: "Dobra",
  possible: "Można lepiej",
  error: "Błąd",
};
export const REVIEW_COLORS = { yours: "#ffffff", better: "#8ee86b" } as const;

export type DecisionReview = {
  index: number;
  /** The live picture just before the decision. */
  before: JourneySession;
  better: DecisionOption | null;
  paths: PlannedAction[];
};

/** Rebuilds the picture before decision `index` by replaying the saved choices. */
export function stateBefore(session: JourneySession, index: number): JourneySession {
  let s = createJourneyForRules(session.definition, session.rulesVersion ?? 9);
  for (const d of session.decisions.slice(0, index))
    s = chooseJourney(s, d.choiceId, d.decisionSeconds, false);
  return { ...s, controlledId: "you" };
}

/** Parses the endpoint of a saved rules-v9 choice id. */
function savedChoice(id: string): Pick<JourneyChoice, "intent" | "point" | "targetId"> | null {
  const m = /^attack9:[^:]+:([a-z]+):[^:]+:[^:]+:(-?[\d.]+):(-?[\d.]+):(.+)$/.exec(id);
  if (!m) return null;
  return {
    intent: m[1] as JourneyChoice["intent"],
    point: { x: Number(m[2]), y: Number(m[3]) },
    targetId: m[4] === "space" ? undefined : m[4],
  };
}

export function reviewDecision(session: JourneySession, index: number): DecisionReview {
  const decision = session.decisions[index];
  const before = { ...stateBefore(session, index), controlledId: decision.actorId ?? "you" };
  let better: DecisionOption | null = null;
  if (decision.quality !== "good")
    for (const option of decisionOptions(before)) {
      if (option.choice.id === decision.choiceId) continue;
      const next = chooseJourney(before, option.choice.id, 0, false);
      if (next.decisions.at(-1)?.quality === "good") {
        better = option;
        break;
      }
    }
  const yours = savedChoice(decision.choiceId);
  const paths = [
    yours && choicePath(before, "yours", yours, REVIEW_COLORS.yours),
    better && choicePath(before, "better", better.choice, REVIEW_COLORS.better),
  ].filter((p): p is PlannedAction => !!p);
  return { index, before, better, paths };
}
