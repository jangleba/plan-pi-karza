import { describe, expect, it } from "vitest";
import { evaluateDecision } from "./engine";
import { planPass, plannedState, planMovement } from "./planner";
import { createPlayback, samplePlayback } from "./playback";
import { scenarios, scenarioVariant } from "./scenarios";
import { simulate } from "./simulation";
import type { PlannedAction, Scenario } from "./types";

const testScene = (): Scenario => ({
  id: "test",
  title: "",
  question: "",
  focus: "",
  seconds: 20,
  controlledPlayerId: "a",
  ballCarrierId: "a",
  referenceActions: [],
  simulation: { reaction: 10, defenderSpeed: 1.8 },
  players: [
    { id: "a", team: "home", number: 8, role: "SP", x: 20, y: 80 },
    { id: "b", team: "home", number: 7, role: "PS", x: 80, y: 80 },
    { id: "d", team: "away", number: 4, role: "SO", x: 50, y: 80 },
    { id: "g", team: "away", number: 1, role: "BR", goalkeeper: true, x: 50, y: 12 },
  ],
});
const pass: PlannedAction = {
  id: "p",
  type: "pass",
  playerId: "a",
  targetId: "b",
  from: { x: 20, y: 80 },
  to: { x: 80, y: 80 },
};
describe("IQ tactical outcomes and replay", () => {
  it("mirrors both the positions and the Polish direction labels", () => {
    const mirror = scenarioVariant(scenarios[0], 1);
    expect(mirror.focus).toContain("w prawo");
    expect(mirror.focus).toContain("lewe skrzydło");
    expect(
      scenarioVariant(
        scenarios.find((s) => s.id === "switch-left-10")!,
        1,
      ).title,
    ).toContain("prawa");
  });
  for (let variant = 0; variant < 3; variant++)
    for (const base of scenarios)
      it(`executes authored example ${base.id}, variant ${variant}`, () => {
        const s = scenarioVariant(base, variant),
          sim = simulate(s, s.referenceActions);
        expect(sim.valid).toBe(true);
        expect(sim.lost).toBe(false);
        expect(evaluateDecision(s, s.referenceActions).level).toBe("strong");
        const frame = samplePlayback(createPlayback(s, s.referenceActions), 1);
        expect(frame.ballCarrierId).toBe(sim.final.ballCarrierId);
        expect(frame.ball).toEqual(sim.final.ball);
      });
  it("does not award the old unrelated-run exploit", () => {
    const s = scenarios[0],
      first = s.referenceActions[0];
    const fake: PlannedAction = {
      id: "fake",
      type: "run",
      playerId: "home-10",
      from: { x: 18, y: 66 },
      to: { x: 85, y: 45 },
    };
    expect(evaluateDecision(s, [first, fake]).level).not.toBe("strong");
  });
  it("stops the replay where a ground pass is intercepted", () => {
    const s = testScene(),
      result = simulate(s, [pass]);
    expect(result.lost).toBe(true);
    expect(result.events[0].kind).toBe("interception");
    expect(result.final.ballCarrierId).toBe("d");
    expect(evaluateDecision(s, [pass]).level).toBe("risky");
  });
  it("an aerial delivery clears the same defender, instead of sharing ground-pass logic", () => {
    const result = simulate(testScene(), [{ ...pass, delivery: "cross" }]);
    expect(result.lost).toBe(false);
    expect(result.final.ballCarrierId).toBe("b");
    expect(Math.max(...result.frames.map((f) => f.ballHeight))).toBeGreaterThan(6);
  });
  it("shows the receiving run while the through pass is travelling", () => {
    const s = testScene();
    s.players[2].x = 5;
    const planned = planPass(s, [], "b", "through", "through")!;
    const result = simulate(s, [planned]);
    expect(result.frames.some((f) => f.ballInFlight && f.positions.get("b")!.y < 80)).toBe(true);
    expect(result.final.ballCarrierId).toBe("b");
  });
  it("finishes with an optional shot choice without a goal trajectory or score", () => {
    const s = scenarios.find((s) => s.id === "shot-15")!;
    const shot: PlannedAction = {
      id: "finish",
      type: "shot",
      playerId: s.ballCarrierId,
      from: { x: 56, y: 26 },
      to: { x: 50, y: 3 },
    };
    const sim = simulate(s, [shot]);
    expect(sim.valid).toBe(true);
    expect(sim.frames.every((frame) => !frame.ballInFlight)).toBe(true);
    expect(sim.final.ball).toEqual(sim.initial.ball);
    expect(sim.events.at(-1)?.text).toContain("celu taktycznego");
    expect(evaluateDecision(s, [shot]).level).not.toBe("strong");
  });
  it("keeps the tactical result when an optional finish follows a completed objective", () => {
    const s = scenarios.find((s) => s.id === "shot-15")!;
    const shot: PlannedAction = {
      id: "finish",
      type: "shot",
      playerId: s.ballCarrierId,
      from: { x: 60, y: 15 },
      to: { x: 50, y: 3 },
    };
    expect(evaluateDecision(s, s.referenceActions).level).toBe("strong");
    expect(evaluateDecision(s, [...s.referenceActions, shot]).level).toBe("strong");
  });
  it("pressure can take the ball away while the player waits", () => {
    const s = testScene();
    s.players[2] = { ...s.players[2], x: 20, y: 75 };
    s.simulation = { reaction: 0, defenderSpeed: 4 };
    const hold: PlannedAction = {
      id: "h",
      type: "hold",
      playerId: "a",
      from: { x: 20, y: 80 },
      to: { x: 20, y: 80 },
    };
    const result = simulate(s, [hold]);
    expect(result.lost).toBe(true);
    expect(result.final.ballCarrierId).toBe("d");
  });
  it("does not reset the opponent reaction clock for every short action", () => {
    const s = testScene();
    s.players[2] = { ...s.players[2], x: 20, y: 75 };
    s.simulation = { reaction: 1.35, defenderSpeed: 4 };
    const hold: PlannedAction = {
      id: "h",
      type: "hold",
      playerId: "a",
      from: { x: 20, y: 80 },
      to: { x: 20, y: 80 },
    };
    expect(simulate(s, [hold, { ...hold, id: "h2" }, { ...hold, id: "h3" }]).lost).toBe(true);
  });
  it("does not accept a ninety-metre shot or a nonexistent marking target", () => {
    const s = testScene();
    s.players[0].y = 120;
    const shot: PlannedAction = {
      id: "long",
      type: "shot",
      playerId: "a",
      from: { x: 20, y: 120 },
      to: { x: 50, y: 3 },
    };
    expect(simulate(s, [shot]).valid).toBe(false);
    const mark: PlannedAction = {
      id: "bad",
      type: "mark",
      playerId: "a",
      opponentId: "missing",
      from: { x: 20, y: 120 },
      to: { x: 30, y: 100 },
    };
    expect(simulate(s, [mark]).valid).toBe(false);
  });
  it("a successful manual press ends with the defender in possession", () => {
    const s = scenarios.find((s) => s.id === "press-16")!,
      result = simulate(s, s.referenceActions);
    expect(result.events.some((e) => e.kind === "tackle")).toBe(true);
    expect(result.final.ballCarrierId).toBe("home-8");
    expect(result.lost).toBe(false);
  });
  it("rejects possession and coordinate errors before evaluating tactics", () => {
    const wrong = { ...pass, playerId: "b", targetId: "a" };
    expect(simulate(testScene(), [wrong]).valid).toBe(false);
    expect(simulate(testScene(), [{ ...pass, to: { x: NaN, y: 1 } }]).valid).toBe(false);
  });
  it("undo gives the next pass to the actual current carrier", () => {
    const s = scenarios[0],
      first = planPass(s, [], "home-7", "one")!;
    expect(plannedState(s, [first]).ballCarrierId).toBe("home-7");
    expect(planPass(s, [], "home-7", "after-undo")?.playerId).toBe("home-8");
  });
  it("distinguishes off-ball movement from carrying", () => {
    const s = scenarios[0];
    expect(planMovement(s, [], "home-8", "run", { x: 50, y: 80 }, "bad")).toBeNull();
    expect(planMovement(s, [], "home-8", "carry", { x: 50, y: 80 }, "good")?.type).toBe("carry");
  });
  it("is deterministic and leaves scenario coordinates intact", () => {
    const s = scenarios[0],
      original = structuredClone(s);
    const a = simulate(s, s.referenceActions),
      b = simulate(s, s.referenceActions);
    expect(a.events).toEqual(b.events);
    expect(a.final).toEqual(b.final);
    expect(s).toEqual(original);
  });
});
