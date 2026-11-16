import { describe, expect, it } from "vitest";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "@/lib/loadwise/individualFootballDrills";
import { resolveTrainingField } from "./model";

const exercise = (
  exerciseId: string,
  overrides: Partial<TrainingExercise> = {},
): TrainingExercise => ({
  id: "saved-exercise",
  name: "Exercise",
  exerciseId,
  ...overrides,
});
const dose = { sets: 4, distanceM: 20, restSeconds: 120, intent: "explosive" as const };

describe("training field instruction contracts", () => {
  it.each(INDIVIDUAL_FOOTBALL_DRILLS.map((drill) => [drill.id, drill.steps[0]] as const))(
    "%s preserves the canonical setup and keeps its routes inside the drawing",
    (id, setup) => {
      const field = resolveTrainingField(exercise(id))!;
      expect(field.setup).toBe(setup);
      expect(field.steps.length).toBeGreaterThanOrEqual(3);
      for (const route of field.routes) {
        expect(route.points.length).toBeGreaterThan(1);
        for (const [x, y] of route.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
      }
      for (const step of field.steps)
        for (const route of step.routes)
          expect(field.routes.some((r) => r.id === route)).toBe(true);
    },
  );

  it("separates the ball travelling to the wall, reception and carrying after a turn", () => {
    const field = resolveTrainingField(exercise("football_wall_receive_turn"))!;
    expect(field.wall).toBe(true);
    expect(field.steps.map((step) => step.title)).toEqual([
      "Ustaw",
      "Podaj",
      "Przyjmij",
      "Prowadź",
    ]);
    expect(field.routes.find((r) => r.id === "pass")?.action).toBe("pass");
    expect(field.routes.find((r) => r.id === "receive")?.action).toBe("carry");
    expect(field.steps[2].routes).toContain("receive");
    expect(field.steps[3].routes).toEqual(["carry"]);
  });

  it("shows the actual one-touch return pass from the receiving position", () => {
    const field = resolveTrainingField(exercise("football_wall_one_touch"))!;
    const rebound = field.routes.find((r) => r.id === "rebound")!;
    const returned = field.routes.find((r) => r.id === "one-touch")!;
    expect(returned.points[0]).toEqual(rebound.points.at(-1));
    expect(field.steps[2].routes).toEqual(["rebound", "one-touch"]);
    expect(field.steps[2].text).toContain("bez przyjęcia");
  });

  it("carries through mini-gates rather than stopping in front of them", () => {
    const field = resolveTrainingField(exercise("football_gate_dribble"))!;
    const points = field.routes[0].points;
    expect(points.some(([x]) => x < 15)).toBe(true);
    expect(points.some(([, y]) => y < 15)).toBe(true);
  });

  it("uses the saved flying zones separately and does not mutate its prescription", () => {
    const saved = exercise("flying_sprint", {
      engineDose: { ...dose, distanceM: 15, runInM: 20, runOutM: 25 },
    });
    const before = structuredClone(saved);
    const field = resolveTrainingField(saved)!;
    expect(field.measurements).toEqual(["20 m nabiegu", "15 m pracy", "25 m wolnego wybiegu"]);
    expect(field.steps.map((step) => step.title)).toEqual(["Ustaw", "Nabieg", "Sprint", "Wyhamuj"]);
    expect(saved).toEqual(before);
  });

  it("supports only an unambiguous saved legacy flying grammar and invents no run-out metres", () => {
    const field = resolveTrainingField(
      exercise("flying_sprint", { displayPrescription: "4 × 20 m z najazdu 15 m" }),
    )!;
    expect(field.measurements).toEqual(["15 m nabiegu", "20 m pracy"]);
    expect(field.steps.at(-1)?.title).toBe("Wyhamuj");
    expect(
      resolveTrainingField(
        exercise("flying_sprint", { displayPrescription: "4 × 20 m z najazdu 10–15 m" }),
      ),
    ).toBeNull();
    expect(
      resolveTrainingField(
        exercise("flying_sprint", {
          displayPrescription: "4 × 20 m z najazdu 15 m",
          engineDose: { ...dose, runInM: undefined },
        }),
      ),
    ).toBeNull();
  });

  it("never turns sprint dribbling mechanics into carrying a football", () => {
    const field = resolveTrainingField(
      exercise("dribble_to_sprint_transition", {
        engineDose: { ...dose, distanceM: 10, runInM: 10, runOutM: 10 },
      }),
    )!;
    expect(field.routes.every((route) => route.action === "run" || route.action === "return")).toBe(
      true,
    );
    expect(field.steps.every((step) => step.ball === undefined)).toBe(true);
    expect(field.steps[1].text).toContain("bez piłki");
  });

  it("keeps a 180-degree turn's run-out in the finishing direction", () => {
    const field = resolveTrainingField(
      exercise("planned_505", { engineDose: { ...dose, distanceM: 10, runOutM: 5 } }),
    )!;
    const back = field.routes.find((r) => r.id === "back")!;
    const out = field.routes.find((r) => r.id === "run-out")!;
    expect(out.points[0]).toEqual(back.points.at(-1));
    expect(out.points[1][0]).toBeLessThan(out.points[0][0]);
    expect(out.points[1][1]).toBe(out.points[0][1]);
  });

  it("explains acceleration, braking and reacceleration as separate actions without splitting metres by guess", () => {
    const field = resolveTrainingField(
      exercise("accel_decel_reaccel", { engineDose: { ...dose, distanceM: 10, runOutM: 10 } }),
    )!;
    expect(field.steps.map((step) => step.title)).toEqual([
      "Ustaw",
      "Przyspiesz",
      "Opanuj ruch",
      "Rusz ponownie",
      "Wyhamuj",
    ]);
    expect(field.measurements).toEqual(["10 m łącznie pracy", "10 m wolnego wybiegu"]);
  });

  it("uses an explicit running interval course without adding turns, returns or new recovery", () => {
    const field = resolveTrainingField(
      exercise("running_interval_course", { engineDose: { ...dose, distanceM: 250, runOutM: 20 } }),
    )!;
    expect(field.measurements).toEqual(["250 m pracy"]);
    expect(field.routes).toHaveLength(1);
    expect(field.steps.map((step) => step.title)).toEqual(["Ustaw", "Biegnij"]);
  });

  it.each([
    exercise("unknown", { name: "Sprint 20 m", engineDose: dose }),
    exercise("flying_sprint", { reps: "20 m + 15 m" }),
    exercise("free_acceleration_sprint", { reps: "10 m + 10 m" }),
    exercise("free_acceleration_sprint", { reps: "10–20 m" }),
    exercise("free_acceleration_sprint", { engineDose: { ...dose, distanceM: NaN } }),
    exercise("running_interval_course", { duration: "30 s" }),
    exercise("running_interval_course", { reps: "200 m" }),
  ])(
    "does not fabricate geometry from an unknown identity or ambiguous/incomplete dose ($exerciseId)",
    (saved) => {
      expect(resolveTrainingField(saved)).toBeNull();
    },
  );
});
