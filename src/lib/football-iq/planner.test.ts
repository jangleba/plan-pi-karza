import { describe, expect, it } from "vitest";

import type { SimPitchActor } from "@/components/football-iq/SimPitch";
import { applyPlanToActors, planActionPath, planSummary, type IQPlanAction } from "./planner";

const actors: SimPitchActor[] = [
  { id: "self", kind: "self", x: 20, y: 100 },
  { id: "mate-a", kind: "mate", x: 40, y: 85 },
  { id: "mate-b", kind: "mate", x: 70, y: 82 },
  { id: "opponent", kind: "opponent", x: 50, y: 55 },
  { id: "ball", kind: "ball", x: 20, y: 100 },
];

describe("Football IQ — interaktywny planer", () => {
  it("porusza kilkoma zawodnikami i piłką, ale nie pozwala przesuwać rywala", () => {
    const actions: IQPlanAction[] = [
      { id: "a", tool: "overlap", actorId: "mate-a", from: { x: 40, y: 85 }, to: { x: 28, y: 35 } },
      {
        id: "b",
        tool: "diagonal_run",
        actorId: "mate-b",
        from: { x: 70, y: 82 },
        to: { x: 55, y: 30 },
      },
      {
        id: "c",
        tool: "through_ball",
        actorId: "self",
        from: { x: 20, y: 100 },
        to: { x: 55, y: 30 },
      },
    ];

    const moved = applyPlanToActors(actors, actions, 1);
    expect(moved.find((actor) => actor.id === "mate-a")).toMatchObject({ x: 28, y: 35 });
    expect(moved.find((actor) => actor.id === "mate-b")).toMatchObject({ x: 55, y: 30 });
    expect(moved.find((actor) => actor.id === "ball")).toMatchObject({ x: 55, y: 30 });
    expect(moved.find((actor) => actor.id === "opponent")).toMatchObject({ x: 50, y: 55 });
  });

  it("odtwarza sekwencję kilku podań po kolejnych odcinkach", () => {
    const actions: IQPlanAction[] = [
      { id: "a", tool: "pass", from: { x: 20, y: 100 }, to: { x: 45, y: 75 } },
      { id: "b", tool: "one_two", from: { x: 45, y: 75 }, to: { x: 60, y: 45 } },
    ];

    expect(
      applyPlanToActors(actors, actions, 0.5).find((actor) => actor.id === "ball"),
    ).toMatchObject({ x: 45, y: 75 });
    expect(
      applyPlanToActors(actors, actions, 1).find((actor) => actor.id === "ball"),
    ).toMatchObject({ x: 60, y: 45 });
  });

  it("rysuje pełną linię spalonego oraz zamkniętą pułapkę pressingową", () => {
    const offside = planActionPath({
      id: "o",
      tool: "offside_line",
      from: { x: 50, y: 60 },
      to: { x: 50, y: 60 },
    });
    const trap = planActionPath({
      id: "t",
      tool: "press_trap",
      from: { x: 50, y: 60 },
      to: { x: 50, y: 60 },
    });

    expect(offside.variant).toBe("offside");
    expect(offside.points).toEqual([
      { x: 3, y: 60 },
      { x: 97, y: 60 },
    ]);
    expect(trap.variant).toBe("trap");
    expect(trap.points[0]).toEqual(trap.points.at(-1));
  });

  it("wyjaśnia połączenie zagrania z ruchami kilku zawodników", () => {
    const summary = planSummary([
      { id: "p", tool: "cross", from: { x: 8, y: 60 }, to: { x: 50, y: 12 } },
      { id: "r1", tool: "run", actorId: "mate-a", from: { x: 40, y: 85 }, to: { x: 42, y: 20 } },
      {
        id: "r2",
        tool: "decoy_run",
        actorId: "mate-b",
        from: { x: 70, y: 82 },
        to: { x: 74, y: 28 },
      },
    ]);

    expect(summary.decision).toContain("2 skoordynowane biegi");
  });
});
