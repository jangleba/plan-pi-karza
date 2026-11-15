import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionCompletion, SessionDay } from "../loadwise/types";
import {
  FUEL_TARGETS_VERSION,
  classifyFuelDay,
  dedupeActivities,
  fuelDayTargets,
  fuelTargetInputFor,
  type FuelActivity,
} from "./dayTargets";

const day = (date: string, overrides: Partial<SessionDay> = {}) =>
  sessionFixture({ date, dbId: `s-${date}`, ...overrides });
const done = (overrides: Partial<SessionCompletion> = {}): SessionCompletion => ({
  completed: true,
  status: "completed",
  rpe: 6,
  notes: "",
  ...overrides,
});
const input = (
  plan: SessionDay[],
  completions: Record<string, SessionCompletion> = {},
  extra: Partial<Parameters<typeof fuelTargetInputFor>[0]> = {},
) =>
  fuelTargetInputFor({
    plan,
    completions,
    date: "2026-11-14",
    age: 22,
    weightKg: 70,
    nonTrainingActivity: "low",
    ...extra,
  });
const activity = (o: Partial<FuelActivity>): FuelActivity => ({
  key: "a",
  kind: "football",
  durationMin: 60,
  load: "moderate",
  status: "planned",
  ...o,
});

describe("fuel-targets-1: deterministic day model", () => {
  it("is versioned and repeatable: same input, same ranges", () => {
    const i = input([day("2026-11-14", { durationMin: 75, intensity: "wysoka" })]);
    const a = fuelDayTargets(i);
    expect(a.version).toBe(FUEL_TARGETS_VERSION);
    expect(fuelDayTargets(i)).toEqual(a);
    expect(a.dayType).toBe("heavy");
    // 6–8 g/kg and 1.6–2.2 g/kg at 70 kg; energy follows the macros (fat 25–30 %).
    expect(a.carbsG).toEqual({ min: 420, max: 560 });
    expect(a.proteinG).toEqual({ min: 110, max: 155 });
    expect(a.kcal!.min).toBeLessThan(a.kcal!.max);
    expect(a.fatG!.min).toBeGreaterThan(0);
  });

  it("energy never comes from RPE: the same session with RPE 3 or 10 gives the same targets", () => {
    const plan = [day("2026-11-14", { durationMin: 60 })];
    const low = fuelDayTargets(input(plan, { "s-2026-11-14": done({ rpe: 3 }) }));
    const high = fuelDayTargets(input(plan, { "s-2026-11-14": done({ rpe: 10 }) }));
    expect(low).toEqual(high);
  });

  it("a light day before a match keeps high carbohydrate (MD-1)", () => {
    const plan = [
      day("2026-11-14", { durationMin: 40, intensity: "niska", dayType: "recovery" }),
      day("2026-11-15", { dayType: "match", durationMin: 0, title: "Mecz" }),
    ];
    const t = fuelDayTargets(input(plan));
    expect(t.dayType).toBe("match_prep");
    expect(t.carbsGPerKg).toEqual({ min: 6, max: 8 });
    expect(t.reason).toContain("nie zmniejsza");
  });

  it("a cancelled training does not count; the day falls back to rest", () => {
    const plan = [day("2026-11-14", { durationMin: 90, intensity: "wysoka" })];
    const planned = fuelDayTargets(input(plan));
    const missed = fuelDayTargets(
      input(plan, { "s-2026-11-14": done({ completed: false, status: "missed" }) }),
    );
    expect(planned.dayType).toBe("heavy");
    expect(missed.dayType).toBe("rest");
    expect(missed.trainingMinutes).toBe(0);
  });

  it("an unavailable day is not a training day", () => {
    const t = fuelDayTargets(input([day("2026-11-14", { durationMin: 90, isUnavailable: true })]));
    expect(t.dayType).toBe("rest");
  });

  it("two activities in one day are summed, once each", () => {
    const second = day("2026-11-14", { dbId: "s-pm", durationMin: 50, intensity: "umiarkowana" });
    const plan = [
      day("2026-11-14", { durationMin: 45, intensity: "niska", secondSession: second }),
    ];
    const t = fuelDayTargets(input(plan));
    expect(t.trainingMinutes).toBe(95);
    expect(t.dayType).toBe("moderate");
    expect(t.reason).toContain("2 aktywności");
  });

  it("a duplicate import of the same session counts once", () => {
    const one = day("2026-11-14", { durationMin: 70 });
    const twice = fuelDayTargets(input([one, { ...one }]));
    const single = fuelDayTargets(input([one]));
    expect(twice.trainingMinutes).toBe(70);
    expect(twice).toEqual(single);
  });

  it("the completed duration replaces the plan (no plan + completion double count)", () => {
    const plan = [day("2026-11-14", { durationMin: 60 })];
    const t = fuelDayTargets(input(plan, { "s-2026-11-14": done({ durationMin: 130 }) }));
    expect(t.trainingMinutes).toBe(130);
    expect(t.dayType).toBe("heavy");
  });

  it("completion wins over a duplicate planned row, cancellation never over completion", () => {
    expect(
      dedupeActivities([
        activity({ status: "planned", durationMin: 60 }),
        activity({ status: "completed", durationMin: 80 }),
        activity({ status: "cancelled" }),
      ]),
    ).toEqual([activity({ status: "completed", durationMin: 80 })]);
  });

  it("activity outside training is asked separately and shifts one band at most", () => {
    const base = { activities: [], previous: null, matchToday: false, matchTomorrow: false };
    expect(classifyFuelDay({ ...base, nonTrainingActivity: "low" }).dayType).toBe("rest");
    expect(classifyFuelDay({ ...base, nonTrainingActivity: "high" }).dayType).toBe("light");
    expect(
      classifyFuelDay({
        ...base,
        nonTrainingActivity: "high",
        activities: [activity({ durationMin: 120, load: "high" })],
      }).dayType,
    ).toBe("heavy");
  });

  it("the day after a match is recovery, unless the athlete did not play", () => {
    const plan = [
      day("2026-11-13", { dayType: "match", durationMin: 0, title: "Mecz" }),
      day("2026-11-14", { durationMin: 30, intensity: "niska", dayType: "recovery" }),
    ];
    expect(fuelDayTargets(input(plan)).dayType).toBe("match_recovery");
    const bench = fuelDayTargets(input(plan, { "s-2026-11-13": done({ matchMinutesPlayed: 0 }) }));
    expect(bench.dayType).not.toBe("match_recovery");
  });

  it("a heavy previous day keeps a rest day off the lowest band", () => {
    const plan = [day("2026-11-13", { durationMin: 90, intensity: "wysoka" })];
    expect(fuelDayTargets(input(plan)).dayType).toBe("light");
  });

  it("without body mass: portions, no grams and no calories, marked as limited precision", () => {
    const t = fuelDayTargets(input([day("2026-11-14")], {}, { weightKg: null }));
    expect(t.precision).toBe("portions");
    expect(t.kcal).toBeNull();
    expect(t.carbsG).toBeNull();
    expect(t.missing).toContain("weight");
    expect(t.portions.length).toBeGreaterThan(20);
  });

  it("minors: no deficit and no weight-loss target; under 16 portions only", () => {
    const sixteen = fuelDayTargets(input([day("2026-11-14")], {}, { age: 16 }));
    expect(sixteen.youth).toBe(true);
    expect(sixteen.precision).toBe("grams");
    // The ranges never go below the adult day band: no deficit for a growing athlete.
    const adult = fuelDayTargets(input([day("2026-11-14")]));
    expect(sixteen.carbsG!.min).toBe(adult.carbsG!.min);
    expect(sixteen.kcal!.min).toBeGreaterThan(0);
    const fifteen = fuelDayTargets(input([day("2026-11-14")], {}, { age: 15 }));
    expect(fifteen.precision).toBe("portions");
    expect(fifteen.kcal).toBeNull();
  });

  it("an implausible body mass is ignored", () => {
    expect(fuelDayTargets(input([day("2026-11-14")], {}, { weightKg: 900 })).precision).toBe(
      "portions",
    );
  });

  it("a plan change updates tomorrow's recommendation", () => {
    const today = day("2026-11-14", { durationMin: 45 });
    const before = fuelDayTargets(input([today]));
    const after = fuelDayTargets(
      input([today, day("2026-11-15", { dayType: "match", durationMin: 0, title: "Mecz" })]),
    );
    expect(before.dayType).not.toBe("match_prep");
    expect(after.dayType).toBe("match_prep");
  });
});
