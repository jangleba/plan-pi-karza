import { describe, expect, it } from "vitest";
import { evaluate } from "./engine";
import { scenariosForPosition, SIM_SCENARIOS } from "./scenarios";

describe("BallWise IQ — integralność biblioteki mikrosymulacji", () => {
  it("każdy scenariusz jest kompletny, osiągalny i deterministyczny", () => {
    expect(SIM_SCENARIOS.length).toBeGreaterThan(0);
    expect(new Set(SIM_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      SIM_SCENARIOS.length,
    );

    for (const scenario of SIM_SCENARIOS) {
      expect(scenario.positions.length).toBeGreaterThan(0);
      expect(scenario.actors.some((actor) => actor.kind === "self")).toBe(true);
      expect(scenario.reactions.length).toBeGreaterThan(0);
      expect(scenario.actions.length).toBeGreaterThan(0);
      expect(scenario.zones.length).toBeGreaterThan(0);
      expect(scenario.timingWindows.length).toBeGreaterThan(0);

      for (const actor of scenario.actors) {
        expect(actor.path.length).toBeGreaterThan(0);
        for (const frame of actor.path) {
          expect(frame.t).toBeGreaterThanOrEqual(0);
          expect(frame.t).toBeLessThanOrEqual(1);
          expect(frame.x).toBeGreaterThanOrEqual(0);
          expect(frame.x).toBeLessThanOrEqual(100);
          expect(frame.y).toBeGreaterThanOrEqual(0);
          expect(frame.y).toBeLessThanOrEqual(140);
        }
      }

      for (const reaction of scenario.reactions) {
        const action = scenario.actions.find(
          (candidate) => candidate.outcomes[reaction.id],
        );
        expect(action, `${scenario.id}: brak wyniku dla ${reaction.id}`).toBeDefined();
        const alternative = scenario.alternatives[reaction.id];
        expect(alternative, `${scenario.id}: brak alternatywy dla ${reaction.id}`).toBeDefined();
        expect(
          scenario.actions.some((candidate) => candidate.id === alternative?.actionId),
          `${scenario.id}: alternatywa wskazuje nieistniejącą akcję`,
        ).toBe(true);
      }

      const zone = scenario.zones[0];
      const choice = {
        timingMs: scenario.timingWindows[0].fromMs,
        x: zone.x,
        y: zone.y,
        angleDeg: scenario.bodyAngles[0].centerDeg,
        foot: scenario.feet[0].foot,
        actionId: scenario.actions[0].id,
      } as const;
      expect(evaluate(scenario, choice)).toEqual(evaluate(scenario, choice));
    }
  });

  it("ma odrębne scenariusze dla każdej grupy, w tym 36 wariantów bramkarskich", () => {
    expect(SIM_SCENARIOS.filter((scenario) => scenario.positions.includes("goalkeeper"))).toHaveLength(36);
    for (const level of ["beginner", "intermediate", "advanced", "elite"] as const) {
      const goalkeeperPool = scenariosForPosition("goalkeeper", level);
      expect(goalkeeperPool).toHaveLength(9);
      expect(goalkeeperPool.every((scenario) => scenario.levels?.includes(level))).toBe(true);
    }
    expect(SIM_SCENARIOS.some((scenario) => scenario.positions.includes("defender"))).toBe(true);
    expect(SIM_SCENARIOS.some((scenario) => scenario.positions.includes("midfielder"))).toBe(true);
    expect(SIM_SCENARIOS.some((scenario) => scenario.positions.includes("forward"))).toBe(true);
  });
});
