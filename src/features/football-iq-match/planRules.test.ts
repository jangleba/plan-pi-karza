import { describe, expect, it } from "vitest";
import {
  canAppendAction,
  canAppendPlannedAction,
  canUseParticipant,
  MAX_PLAN_ACTIONS,
  MAX_PLAN_PASSES,
} from "./planRules";
import type { PlannedAction } from "./types";

const run = (order: number, playerId = `player-${order}`): PlannedAction => ({
  id: `run-${order}`,
  type: "run",
  order,
  moves: [{ playerId, from: { x: 10, y: 20 }, to: { x: 20, y: 30 } }],
});

const pass = (order: number, passerId?: string, receiverId?: string): PlannedAction => ({
  id: `pass-${order}`,
  type: "pass",
  order,
  from: { x: 20, y: 30 },
  to: { x: 40, y: 40 },
  passerId,
  receiverId,
});

describe("Football IQ plan limits", () => {
  it("allows at most three actions", () => {
    expect(MAX_PLAN_ACTIONS).toBe(3);
    expect(canAppendAction([run(1), pass(2), run(3)], "run").allowed).toBe(false);
  });

  it("allows at most one pass and unlocks it after undo", () => {
    expect(MAX_PLAN_PASSES).toBe(1);
    expect(canAppendAction([pass(1)], "pass").allowed).toBe(false);
    expect(canAppendAction([], "pass").allowed).toBe(true);
  });

  it("allows the controlled player and at most two distinct partners", () => {
    const actions = [run(1, "me"), run(2, "partner-a")];
    expect(canUseParticipant(actions, "partner-b", "me").allowed).toBe(true);
    expect(canAppendPlannedAction(actions, run(3, "partner-b"), "me").allowed).toBe(true);
  });

  it("rejects a third distinct partner in a run or as a pass receiver", () => {
    const actions = [run(1, "partner-a"), run(2, "partner-b")];
    expect(canUseParticipant(actions, "partner-c", "me").allowed).toBe(false);
    expect(canAppendPlannedAction(actions, pass(3, "me", "partner-c"), "me").allowed).toBe(false);
  });
});
