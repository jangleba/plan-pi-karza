import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  decisionOptions,
  decisionSituation,
  situationLine,
} from "./decisionOptions";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { makeJourneyAttempt, makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { iqScenarioBank } from "./journeyBank";
import {
  authoredSituationBank,
  situationBank,
  situations,
  iqSources,
} from "./situationBank";
import type { JourneySession } from "./journeyTypes";

const all = [...advancedJourneyBank, ...situationBank];

function playThrough(start: JourneySession, pick: (n: number) => number, max = 12) {
  let s = start;
  for (let i = 0; i < max && !s.outcome; i++) {
    const options = decisionOptions(s);
    expect(options.length).toBeGreaterThanOrEqual(2);
    s = chooseJourney(s, options[pick(options.length) % options.length].choice.id, 1);
  }
  return s;
}

describe("decision options", () => {
  it("offers 2–4 distinct playable options at the start of every lesson", () => {
    for (const def of all) {
      const s = createJourneyForRules(def, 9);
      const options = decisionOptions(s);
      expect(options.length, def.id).toBeGreaterThanOrEqual(2);
      expect(options.length, def.id).toBeLessThanOrEqual(4);
      expect(new Set(options.map((o) => o.choice.id)).size).toBe(options.length);
      expect(new Set(options.map((o) => o.label)).size, def.id).toBe(options.length);
      for (const o of options) {
        expect(o.label.length).toBeLessThanOrEqual(40);
        expect(() => chooseJourney(s, o.choice.id, 1), `${def.id} ${o.key}`).not.toThrow();
      }
    }
  });

  it("matches the situation line to who really has the ball", () => {
    for (const def of all) {
      const s = createJourneyForRules(def, 9);
      const kind = decisionSituation(s);
      const line = situationLine(s);
      if (kind === "own") expect(line).toMatch(/^Masz piłkę/);
      if (kind === "partner") expect(line).toMatch(/^Piłkę ma partner/);
      if (kind === "rival") expect(line).toMatch(/^Piłkę ma rywal/);
      const keys = decisionOptions(s).map((o) => o.choice.intent);
      if (kind === "own") expect(keys).toContain("pass");
      else expect(keys).not.toContain("pass");
    }
  });

  it("keeps offering options through whole actions and the attempts replay", () => {
    let finished = 0;
    for (const def of situationBank) {
      // One seed per context keeps the run short with 26 situations × 3 contexts.
      for (const seed of [def.context]) {
        const s = playThrough(createJourneyForRules(def, 9), (n) => (seed + n) % n, 20);
        const id = `t-${def.id}-${seed}`;
        if (s.outcome) finished++;
        const attempt = s.outcome
          ? makeJourneyAttempt(s, "learn", id)
          : makeJourneyDraft(s, "learn", id);
        const restored = restoreJourney(attempt);
        expect(restored.step).toBe(s.step);
        expect(restored.world.carrierId).toBe(s.world.carrierId);
      }
    }
    // Defensive starts often run past 20 decisions before a shot or the time cap.
    expect(finished).toBeGreaterThan(situationBank.length / 4);
  }, 120_000);
});

describe("situation bank", () => {
  it("has sourced match situations in three contexts for every position", () => {
    expect(situations).toHaveLength(34);
    expect(authoredSituationBank).toHaveLength(102);
    for (const role of ["gk", "cb", "fb", "six", "eight", "ten", "wing", "nine"])
      expect(situations.filter((s) => s.role === role).length, role).toBeGreaterThanOrEqual(3);
    for (const s of situations) {
      expect(s.sources.length).toBeGreaterThan(0);
      for (const id of s.sources) expect(iqSources[id].url).toMatch(/^https:\/\//);
    }
    for (const def of situationBank) expect(iqScenarioBank).toContain(def);
  });

  it("places the controlled player and ball carrier as defined", () => {
    for (const def of situationBank) {
      const s = createJourneyForRules(def, 9);
      const situation = situations.find((x) => def.topicId === `iqs-${x.key}`)!;
      expect(s.world.carrierId).toBe(situation.layout.carrier);
      expect(s.players.find((p) => p.id === "you")!.number).toBe(situation.layout.numbers.you);
      for (const p of s.players) {
        const at = s.world.positions[p.id];
        expect(at.x).toBeGreaterThanOrEqual(4);
        expect(at.y).toBeLessThanOrEqual(134);
      }
    }
  });

  it("varies the three contexts on the pitch", () => {
    for (const s of situations) {
      const [a, b, c] = [0, 1, 2].map((i) =>
        JSON.stringify(
          createJourneyForRules(
            situationBank.find((d) => d.id === `iqs-${s.key}-${i}`)!,
            9,
          ).world.positions,
        ),
      );
      expect(new Set([a, b, c]).size).toBe(3);
    }
  });
});
