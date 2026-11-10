import { describe, expect, it } from "vitest";
import { assessDecision } from "./decisionAssessment";
import { pickerItems } from "./journeyGuide";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { sampleChoices } from "./playability";
import {
  classOfChoiceId,
  retryVerdict,
  solutionKind,
  solutionMap,
  type SolutionKind,
} from "./solutionSpace";

/** Offered first pictures with at least two kinds of good answer (24 of 32 on 2026-11-10). */
const SEVERAL_KINDS = 24;
const firstPictures = pickerItems(undefined, true).map((i) => i.def);

describe("several good answers", () => {
  it("treats a ground and a lofted ball to the same partner as one idea", () => {
    expect(classOfChoiceId("attack9:you:pass:ground:now:10.00:20.00:wide")).toBe(
      classOfChoiceId("attack9:you:pass:lofted:now:12.00:24.00:wide"),
    );
    expect(classOfChoiceId("attack9:you:pass:ground:now:10.00:20.00:wide")).not.toBe(
      classOfChoiceId("attack9:you:pass:ground:now:10.00:20.00:forward"),
    );
    expect(classOfChoiceId("attack9:you:carry:ground:now:10.00:20.00:space")).not.toBe(
      classOfChoiceId("attack9:you:carry:ground:now:40.00:20.00:space"),
    );
    expect(classOfChoiceId("old-id")).toBeNull();
  });

  it("names only good decisions and counts a second answer only when it differs", () => {
    const start = createJourneyForRules(firstPictures[0], 9);
    const graded = sampleChoices(start).map((c) => {
      const next = chooseJourney(start, c.id, 0, false);
      return { c, a: assessDecision(next, next.decisions.length - 1) };
    });
    for (const { a } of graded) expect(solutionKind(a) === null).toBe(a.grade !== "good");
    const good = graded.filter((g) => g.a.grade === "good");
    const weaker = graded.find((g) => g.a.grade !== "good");
    expect(good.length).toBeGreaterThan(0);
    expect(retryVerdict(good[0].c.id, good[0].c.id, good[0].a)).toBe("same");
    const other = good.find((g) => classOfChoiceId(g.c.id) !== classOfChoiceId(good[0].c.id));
    if (other) expect(retryVerdict(good[0].c.id, other.c.id, other.a)).toBe("another");
    if (weaker) expect(retryVerdict(good[0].c.id, weaker.c.id, weaker.a)).toBe("weaker");
  });

  it("finds more than one kind of good answer on most offered pictures", () => {
    const kinds = firstPictures.map((def) =>
      solutionMap(createJourneyForRules(def, 9)).map((o) => o.kind),
    );
    // Every offered picture has at least one good answer (playability check)…
    for (const [i, k] of kinds.entries()) expect(k.length, firstPictures[i].id).toBeGreaterThan(0);
    // …and most of them more than one kind. Ratchet: may only go up.
    const several = kinds.filter((k) => k.length >= 2).length;
    expect(several).toBeGreaterThanOrEqual(SEVERAL_KINDS);
    const seen = new Set<SolutionKind>(kinds.flat());
    expect(seen.size).toBe(4);
  }, 120_000);

  it("grades an intercepted pass through a lane open at the decision as a read, not a blind pass", () => {
    let checked = 0;
    for (const def of firstPictures) {
      const start = createJourneyForRules(def, 9);
      for (const c of sampleChoices(start).filter((c) => c.intent === "pass")) {
        const next = chooseJourney(start, c.id, 0, false);
        const a = assessDecision(next, next.decisions.length - 1);
        if (a.facts.passResult !== "intercepted") continue;
        checked++;
        if (a.facts.passLane >= 5) expect(a.problem).toBe("lane-read");
        else expect(a.problem).toBe("lane-closed");
        expect(a.result).toBe("Strata piłki");
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});
