import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  decisionOptions,
  decisionSituation,
  OPTION_MARKS,
  optionPaths,
  situationLine,
} from "./decisionOptions";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import { makeJourneyAttempt, makeJourneyDraft, restoreJourney } from "./journeyHistory";
import { iqScenarioBank } from "./journeyBank";
import { situationBank, situations, iqSources } from "./situationBank";
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
      for (const seed of [0, 1, 2]) {
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
    expect(finished).toBeGreaterThan(situationBank.length / 2);
  }, 60_000);
});

describe("situation bank", () => {
  it("adds nine sourced match situations in three contexts", () => {
    expect(situations).toHaveLength(9);
    expect(situationBank).toHaveLength(27);
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

describe("tactics-board arrows", () => {
  it("draws one coloured arrow per moving option and only the chosen one after a pick", () => {
    for (const def of situationBank) {
      const s = createJourneyForRules(def, 9);
      const options = decisionOptions(s);
      const paths = optionPaths(s, options);
      const moving = options.filter(
        (o) =>
          Math.hypot(
            o.choice.point.x - s.world.positions.you.x,
            o.choice.point.y - s.world.positions.you.y,
          ) >= 1,
      );
      expect(paths).toHaveLength(moving.length);
      expect(new Set(paths.map((p) => p.analysisColor)).size).toBe(paths.length);
      const picked = moving[0];
      if (picked) {
        const one = optionPaths(s, options, picked.key);
        expect(one).toHaveLength(1);
        expect(one[0].analysisColor).toBe(OPTION_MARKS[options.indexOf(picked)].color);
      }
    }
  });
});
