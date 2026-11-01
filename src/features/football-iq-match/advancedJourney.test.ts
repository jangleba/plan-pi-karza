import { describe, expect, it } from "vitest";
import { advancedJourneyBank, ADVANCED_JOURNEY_BANK_VERSION } from "./advancedJourneyBank";
import {
  chooseJourney,
  createJourneyForRules,
  journeyDuration,
  journeyFrame,
  journeyStep,
  sampleJourneyBeat,
  journeyPointChoice,
} from "./journeyEngine";
import { makeJourneyAttempt, makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { journeyDebrief, journeyDebriefText } from "./journeyDebrief";
import type { JourneyDefinition, JourneySession } from "./journeyTypes";
const createJourney = (definition: JourneyDefinition) => createJourneyForRules(definition, 5);

function complete(s: JourneySession): JourneySession | null {
  if (s.outcome)
    return s.step === 6 && !["loss", "blocked"].includes(s.outcome) && !s.transition ? s : null;
  for (const c of [...journeyStep(s).choices].sort(
    (a, b) => Number(a.quality !== "good") - Number(b.quality !== "good"),
  )) {
    if (c.quality === "error") continue;
    const next = complete(chooseJourney(s, c.id, 2, false));
    if (next) return next;
  }
  return null;
}
describe("advanced positional IQ", () => {
  it("offers 72 different starting setups, six decisions and 12 actual players", () => {
    expect(advancedJourneyBank).toHaveLength(72);
    const setups = new Set<string>();
    for (const d of advancedJourneyBank) {
      const s = createJourney(d);
      expect(s.rulesVersion).toBe(5);
      expect(s.players).toHaveLength(12);
      expect(s.definition.steps).toHaveLength(6);
      expect(s.scenario.players).toBe(s.players);
      setups.add(JSON.stringify([d.role, d.steps, s.initial]));
    }
    expect(setups.size).toBe(72);
  });
  it("has a complete non-error route in every context and keeps frame boundaries continuous", () => {
    const missing: string[] = [];
    for (const definition of advancedJourneyBank) {
      const original = createJourney(definition),
        snapshot = JSON.stringify(original),
        s = complete(original);
      if (!s) {
        missing.push(definition.id);
        continue;
      }
      expect(JSON.stringify(original)).toBe(snapshot);
      for (let i = 0; i < s.beats.length; i++) {
        const beat = s.beats[i];
        if (i) expect(beat.before).toEqual(s.beats[i - 1].after);
        expect(sampleJourneyBeat(beat, s.players, 0).positions).toEqual(
          journeyFrame(beat.before, s.players).positions,
        );
        expect(
          Object.fromEntries(sampleJourneyBeat(beat, s.players, beat.duration).positions),
        ).toEqual(beat.after.positions);
      }
      expect(journeyDuration(s)).toBeGreaterThan(6);
      expect(s.beats.some((b) => b.text.includes("przesuwa nacisk"))).toBe(true);
    }
    expect(missing).toEqual([]);
  });
  it("assesses every offered option consistently on a successful route and preserves exact replays", () => {
    for (const definition of advancedJourneyBank) {
      const final = complete(createJourney(definition));
      if (!final) throw new Error(definition.id);
      let s = createJourney(definition);
      for (const d of final.decisions) {
        const step = journeyStep(s);
        for (const c of step.choices) {
          const next = chooseJourney(s, c.id, 2, false);
          if (c.quality === "good")
            expect(next.decisions.at(-1)?.quality, `${definition.id}:${s.step}:${c.id}`).not.toBe(
              "error",
            );
          if (["move", "carry"].includes(step.kind))
            expect(journeyPointChoice(s, c.point).quality).toBe(c.quality);
        }
        s = chooseJourney(s, d.choiceId, d.decisionSeconds);
      }
      const attempt = makeJourneyAttempt(s, "learn", definition.id);
      expect(attempt.bankVersion).toBe(ADVANCED_JOURNEY_BANK_VERSION);
      expect(restoreJourney(attempt)).toEqual(s);
      const report = journeyDebrief(s)!;
      expect(report.observation.length).toBeGreaterThan(60);
      expect(report.rule.signal).toBeTruthy();
      expect(report.rule.exception).toBeTruthy();
      expect(journeyDebriefText(s, report)).toContain("DO WYKORZYSTANIA W MECZU");
    }
  });
  it("keeps an unfinished advanced action resumable and includes actual third-player passes", () => {
    let thirdPasses = 0;
    for (const definition of advancedJourneyBank.filter((d) => d.concept === "third-player")) {
      const s = createJourney(definition);
      for (const c of journeyStep(s).choices.filter((c) => c.quality !== "error")) {
        const next = chooseJourney(s, c.id, 1);
        expect(restoreJourney(makeJourneyDraft(next, "learn", "draft"))).toEqual(next);
        thirdPasses += next.beats.filter((b) => b.text.includes("Partner gra na trzeciego")).length;
      }
    }
    expect(thirdPasses).toBeGreaterThan(0);
  });
});
