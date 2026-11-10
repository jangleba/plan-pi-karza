import { afterAll, describe, expect, it } from "vitest";
import { isPlayable, playability, type Playability } from "./playability";
import {
  authoredSituationBank,
  generatedSituationBank,
  playableSituationBank,
  situationBank,
} from "./situationBank";
import { RETIRED_SITUATION_IDS } from "./situationVariants";

/** Ratchet on the scenario bank; the limits may only go down.
 * Audit 2026-11-09 (rules v9 rev. 2): 40 of 102 variants where TY's first choice does not
 * change where the ball goes, 10 where it does not even one window later, 14 with no good
 * answer, 8 where the ball is lost whatever TY does.
 * Rev. 3 (carrier reads runs, goal-side tackles): 29 / 5 / 13 / 8.
 * With press, mark and shielding among TY's actions: 24 / 4 / 9 / 8.
 * These numbers are about the authored pictures only; the ones that fail the playability
 * check are retired from play (kept for replays) and seeded variants replace them. */
const LIMITS = { deadDecision: 24, deadLater: 4, noGoodAnswer: 9, forcedLoss: 8 };

const rows = new Map<string, Playability>();
describe("IQ scenario playability", () => {
  const families = [...new Set(situationBank.map((d) => d.topicId))];
  it.each(families)("%s: every variant plays and is graded", (topic) => {
    for (const def of situationBank.filter((d) => d.topicId === topic)) {
      const row = playability(def);
      expect(row.tried).toBeGreaterThanOrEqual(9);
      expect(row.good + row.possible + row.error).toBe(row.tried);
      rows.set(def.id, row);
      // Whatever the player is offered must hold a real decision.
      if (!RETIRED_SITUATION_IDS.has(def.id)) expect(isPlayable(row), def.id).toBe(true);
    }
  });
  afterAll(() => {
    if (rows.size !== situationBank.length) return;
    const authored = authoredSituationBank.map((d) => rows.get(d.id)!);
    const dead = authored.filter((r) => r.outcomes <= 1).length;
    const deadLater = authored.filter((r) => r.outcomes <= 1 && r.laterOutcomes <= 1).length;
    const noGood = authored.filter((r) => r.good === 0).length;
    const forced = authored.filter((r) => r.forcedLoss).length;
    expect(dead).toBeLessThanOrEqual(LIMITS.deadDecision);
    expect(deadLater).toBeLessThanOrEqual(LIMITS.deadLater);
    expect(noGood).toBeLessThanOrEqual(LIMITS.noGoodAnswer);
    expect(forced).toBeLessThanOrEqual(LIMITS.forcedLoss);
    // Seeded variants of one situation must ask different questions: different sets of
    // good answers than the other pictures of the same situation.
    for (const topic of families) {
      const sets = playableSituationBank
        .filter((d) => d.topicId === topic)
        .map((d) => rows.get(d.id)!.goodKeys.join("|"));
      expect(new Set(sets).size, topic).toBe(sets.length);
      // A picture is retired only when it fails the check or repeats an offered problem.
      for (const def of situationBank.filter(
        (d) => d.topicId === topic && RETIRED_SITUATION_IDS.has(d.id),
      )) {
        const row = rows.get(def.id)!;
        expect(!isPlayable(row) || sets.includes(row.goodKeys.join("|")), def.id).toBe(true);
      }
    }
    expect(generatedSituationBank.length).toBeGreaterThanOrEqual(90);
  });
});
