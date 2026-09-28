import { describe, expect, it } from "vitest";
import { analyzePassLane, buildReferencePlan, emptyPlan, evaluatePlan } from "./engine";
import { scenarios } from "./scenarios";

describe("Football IQ decision engine", () => {
  it("provides a useful reference plan for every scenario", () => {
    expect(scenarios).toHaveLength(8);
    scenarios.forEach((scenario) => {
      const emptyScore = evaluatePlan(scenario, emptyPlan()).score;
      const reference = buildReferencePlan(scenario);
      const referenceScore = evaluatePlan(scenario, reference).score;
      expect(reference.actions.length).toBeGreaterThan(0);
      expect(referenceScore).toBeGreaterThan(emptyScore);
      expect(referenceScore).toBeLessThanOrEqual(100);
    });
  });

  it("keeps every reference pass outside the interception threshold", () => {
    scenarios.forEach((scenario) => {
      const opponents = scenario.players.filter((player) => player.team === "away");
      const passes = buildReferencePlan(scenario).actions.filter((action) => action.type === "pass");
      passes.forEach((pass) => {
        expect(analyzePassLane(pass, opponents).clearance).toBeGreaterThanOrEqual(3.4);
      });
    });
  });

  it("keeps the transition reference pass at the real ball position", () => {
    const scenario = scenarios.find((item) => item.id === "transition");
    expect(scenario).toBeDefined();
    const firstAction = buildReferencePlan(scenario!).actions[0];
    expect(firstAction.type).toBe("pass");
    if (firstAction.type === "pass") {
      expect(firstAction.from).toEqual({ x: scenario!.ball.x, y: scenario!.ball.y });
    }
  });

  it("detects an opponent inside a passing lane", () => {
    const lane = analyzePassLane(
      { id: "pass", type: "pass", order: 1, from: { x: 10, y: 50 }, to: { x: 90, y: 50 } },
      [{ id: "defender", team: "away", number: 4, role: "ŚO", x: 45, y: 51 }],
    );
    expect(lane.interceptorId).toBe("defender");
    expect(lane.clearance).toBeLessThan(3.4);
  });
});
