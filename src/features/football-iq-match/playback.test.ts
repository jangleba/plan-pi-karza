import { describe, expect, it } from "vitest";
import { actionProgress, actionSchedule, applyActions } from "./playback";
import type { MatchPlayer, PlannedAction, Point } from "./types";

const player = (id: string, x: number, y = 20, team: "home" | "away" = "home"): MatchPlayer => ({
  id,
  x,
  y,
  team,
  number: 1,
  role: "ŚP",
});
const run = (id: string, playerId: string, from: Point, to: Point): PlannedAction => ({
  id,
  type: "run",
  order: 1,
  moves: [{ playerId, from, to }],
});
const pass: PlannedAction = {
  id: "pass",
  type: "pass",
  order: 1,
  from: { x: 10, y: 20 },
  to: { x: 50, y: 20 },
  passerId: "a",
  receiverId: "b",
};
const positionMap = (players: MatchPlayer[]) =>
  new Map(players.map(({ id, x, y }) => [id, { x, y }]));

describe("shared pitch playback", () => {
  it("allows independent movement to overlap but waits for a shared actor", () => {
    const actions = [
      run("a1", "a", { x: 0, y: 0 }, { x: 22, y: 0 }),
      run("b1", "b", { x: 0, y: 10 }, { x: 22, y: 10 }),
      run("b2", "b", { x: 22, y: 10 }, { x: 44, y: 10 }),
    ];
    const schedule = actionSchedule(actions);
    expect(schedule.starts[1]).toBeLessThan(schedule.weights[0]);
    expect(schedule.starts[2]).toBeCloseTo(schedule.starts[1] + schedule.weights[1]);
    expect(actionProgress(0, 0, schedule)).toBe(0);
    expect(actionProgress(1, 2, schedule)).toBe(1);
    expect(actionProgress(0.5, 0, actionSchedule([]))).toBe(0);
  });

  it("keeps the ball with its moving carrier and transfers it to the receiver", () => {
    const players = [player("a", 10), player("b", 50)];
    const positions = positionMap(players);
    const movement = run("a1", "a", players[0], { x: 20, y: 30 });
    expect(
      applyActions(positions, { ...players[0], carrierId: "a" }, [movement], 1, players, true),
    ).toEqual({ x: 20, y: 30, carrierId: "a" });
    const received = applyActions(
      positionMap(players),
      { x: 10, y: 20, carrierId: "a" },
      [pass],
      1,
      players,
      true,
    );
    expect(received).toEqual({ x: 50, y: 20, carrierId: "b" });
    expect(players[0]).toMatchObject({ x: 10, y: 20 });
  });

  it("stops dependent later actions after interception but allows the planning preview", () => {
    const players = [player("a", 10), player("b", 50), player("defender", 30, 20, "away")];
    const actions = [pass, run("b1", "b", players[1], { x: 70, y: 30 })];
    const interceptedPositions = positionMap(players);
    const ball = applyActions(
      interceptedPositions,
      { x: 10, y: 20, carrierId: "a" },
      actions,
      1,
      players,
      true,
    );
    expect(ball).toEqual({ x: 30, y: 20, carrierId: "defender" });
    expect(interceptedPositions.get("b")).toEqual({ x: 50, y: 20 });
    const preview = applyActions(
      positionMap(players),
      { x: 10, y: 20, carrierId: "a" },
      actions,
      1,
      players,
      false,
    );
    expect(preview).toEqual({ x: 70, y: 30, carrierId: "b" });
  });

  it("preserves the initial frame before playback begins", () => {
    const players = [player("a", 10), player("b", 50)];
    const positions = positionMap(players);
    expect(
      applyActions(positions, { x: 0, y: 0, carrierId: "a" }, [pass], 0, players, true),
    ).toEqual({ x: 10, y: 20, carrierId: "a" });
    expect(positions).toEqual(positionMap(players));
  });
});
