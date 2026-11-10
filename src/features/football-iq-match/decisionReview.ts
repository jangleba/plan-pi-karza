/** Review of one decision after it was played: TY's own grade and another good
 * option tried on the same picture (a better one after a weaker choice, a different
 * one after a good choice), with what it produced there.
 */
import { assessDecision, type DecisionAssessment } from "./decisionAssessment";
import { choicePath, decisionOptions, type DecisionOption } from "./decisionOptions";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { sameRevision } from "./liveLesson";
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
  /** TY's own contribution in this decision. */
  assessment: DecisionAssessment;
  /** Another good option on the same picture: better than TY's, or different when TY's was good. */
  better: DecisionOption | null;
  /** What the better option produced when played on the same picture. */
  betterAssessment: DecisionAssessment | null;
  paths: PlannedAction[];
};

/** Rebuilds the picture before decision `index` by replaying the saved choices. */
export function stateBefore(session: JourneySession, index: number): JourneySession {
  let s = createJourneyForRules(session.definition, session.rulesVersion ?? 9);
  // Same rules revision as the action being reviewed.
  s = sameRevision(s, session);
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
  const assessment = assessDecision(session, index);
  let better: DecisionOption | null = null,
    betterAssessment: DecisionAssessment | null = null;
  // The model variant is graded by the same rule as TY: own contribution, not the team result.
  // When TY's own choice was good, look for a different good one (another target or action),
  // so the player sees that the same picture has more than one sensible answer.
  const yours = savedChoice(decision.choiceId);
  for (const option of decisionOptions(before)) {
    if (option.choice.id === decision.choiceId) continue;
    if (
      assessment.grade === "good" &&
      option.choice.intent === yours?.intent &&
      option.choice.targetId === yours?.targetId
    )
      continue;
    const next = chooseJourney(before, option.choice.id, 0, false);
    const tried = assessDecision(next, next.decisions.length - 1);
    if (tried.grade === "good") {
      better = option;
      betterAssessment = tried;
      break;
    }
  }
  const paths = [
    yours && choicePath(before, "yours", yours, REVIEW_COLORS.yours),
    better && choicePath(before, "better", better.choice, REVIEW_COLORS.better),
  ].filter((p): p is PlannedAction => !!p);
  return { index, before, assessment, better, betterAssessment, paths };
}
