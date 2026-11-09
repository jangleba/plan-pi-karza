import { describe, expect, it } from "vitest";
import { decisionOptions } from "./decisionOptions";
import { qualityLabels, REVIEW_COLORS, reviewDecision } from "./decisionReview";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { situationBank } from "./situationBank";

describe("decision review", () => {
  it("shows the real picture before each decision and only better options", () => {
    let checked = 0;
    for (const id of ["iqs-gk-switch-0", "iqs-six-pivot-1", "iqs-cb-step-out-2"]) {
      let s = createJourneyForRules(
        situationBank.find((d) => d.id === id)!,
        9,
      );
      for (let i = 0; i < 4 && !s.outcome; i++) {
        const options = decisionOptions(s);
        s = chooseJourney(s, options[i % options.length].choice.id, 1);
      }
      s.decisions.forEach((d, i) => {
        const review = reviewDecision(s, i);
        expect(review.before.world.positions).toEqual(d.before.positions);
        expect(review.before.world.carrierId).toBe(d.before.carrierId);
        expect(review.paths.length).toBeLessThanOrEqual(2);
        // Graded on TY's own contribution, the same rule the summary uses.
        if (review.assessment.grade === "good") expect(review.better).toBeNull();
        if (review.better) {
          expect(review.better.choice.id).not.toBe(d.choiceId);
          expect(review.betterAssessment?.grade).toBe("good");
          expect(review.paths.some((p) => p.analysisColor === REVIEW_COLORS.better)).toBe(true);
        }
        expect(qualityLabels[review.assessment.grade]).toBeTruthy();
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(3);
  }, 60_000);
});
