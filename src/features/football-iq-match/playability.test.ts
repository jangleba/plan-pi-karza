import { afterAll, describe, expect, it } from "vitest";
import { playability, type Playability } from "./playability";
import { situationBank } from "./situationBank";

/** Ratchet on the scenario bank; the limits may only go down.
 * Audit 2026-11-09 (rules v9 rev. 2): 40 of 102 variants where TY's first choice does not
 * change where the ball goes, 10 where it does not even one window later, 14 with no good
 * answer, 8 where the ball is lost whatever TY does.
 * Rev. 3 (carrier reads runs, goal-side tackles): 29 / 5 / 13 / 8. */
const LIMITS = { deadDecision: 29, deadLater: 5, noGoodAnswer: 13, forcedLoss: 8 };

const rows: Playability[] = [];
describe("IQ scenario playability", () => {
  const families = [...new Set(situationBank.map((d) => d.topicId))];
  it.each(families)("%s: every variant plays and is graded", (topic) => {
    for (const def of situationBank.filter((d) => d.topicId === topic)) {
      const row = playability(def);
      expect(row.tried).toBeGreaterThanOrEqual(9);
      expect(row.good + row.possible + row.error).toBe(row.tried);
      rows.push(row);
    }
  });
  afterAll(() => {
    if (rows.length !== situationBank.length) return;
    const dead = rows.filter((r) => r.outcomes <= 1).length;
    const deadLater = rows.filter((r) => r.outcomes <= 1 && r.laterOutcomes <= 1).length;
    const noGood = rows.filter((r) => r.good === 0).length;
    const forced = rows.filter((r) => r.forcedLoss).length;
    expect(dead).toBeLessThanOrEqual(LIMITS.deadDecision);
    expect(deadLater).toBeLessThanOrEqual(LIMITS.deadLater);
    expect(noGood).toBeLessThanOrEqual(LIMITS.noGoodAnswer);
    expect(forced).toBeLessThanOrEqual(LIMITS.forcedLoss);
  });
});
