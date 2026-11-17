import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionDay } from "../types";
import { plusDays, type EngineSession, type WeeklyTargets } from "./model";
import { weeklyTargetCoverage } from "./weeklyTargets";

const targets: WeeklyTargets = { strength: 2, speed: 2, endurance: 1 };
const lift = (role: "knee_strength" | "hip_strength" | "push" | "knee_flexion") => ({
  exerciseId: role,
  role,
  dose: { sets: 3, reps: 5, rir: 2, restSeconds: 120, intent: "controlled" as const },
  reason: "fixture",
});
// A strength session carries its main lift; the label alone is not the stimulus.
const recipe = (roles: EngineSession["roles"]): EngineSession => ({
  roles,
  tier: "development",
  highLower: false,
  exercises: [
    ...(roles.includes("strengthA") ? [lift("knee_strength")] : []),
    ...(roles.includes("strengthB") ? [lift("hip_strength")] : []),
  ],
  missing: [],
  minutes: 20,
  sprintMetres: 0,
  phase: "development",
});
const rest = (offset: number): SessionDay =>
  sessionFixture({
    date: plusDays("2026-11-16", offset),
    dbId: `day-${offset}`,
    dayType: "rest",
    title: "Odpoczynek",
    durationMin: 0,
  });
const training = (offset: number, roles: EngineSession["roles"]): SessionDay => ({
  ...rest(offset),
  dayType: "training",
  durationMin: 20,
  engineV2: recipe(roles),
});

describe("saved weekly target coverage", () => {
  it("counts the physical first and second slots without counting a strength role twice", () => {
    const monday = training(0, ["strengthA", "strengthB"]);
    monday.secondSession = training(0, ["endurance"]);
    const days = [monday, training(1, ["speed"]), training(2, ["strengthB"]), rest(3)];
    expect(weeklyTargetCoverage(days, targets)).toEqual([
      {
        startDate: "2026-11-16",
        endDate: "2026-11-22",
        requested: targets,
        planned: { strength: 2, speed: 1, endurance: 1 },
        partialStrength: 0,
        fullRestDays: 1,
      },
    ]);
  });

  it("counts an explicit post-match upper-body gym session without classifying it as running", () => {
    const upper = training(0, ["strengthA"]);
    upper.engineV2!.postMatch = "upper";
    upper.engineV2!.exercises = [lift("push")];
    expect(weeklyTargetCoverage([upper], targets)[0].planned).toEqual({
      strength: 1,
      speed: 0,
      endurance: 0,
    });
  });

  it("does not count a strength label without its main leg pattern as full coverage", () => {
    const curlOnly = training(0, ["strengthA"]);
    curlOnly.engineV2!.exercises = [lift("knee_flexion")];
    const noUpper = training(1, ["strengthB"]);
    noUpper.engineV2!.postMatch = "upper";
    noUpper.engineV2!.exercises = [];
    const [week] = weeklyTargetCoverage([curlOnly, noUpper, training(2, ["strengthB"])], targets);
    expect(week.planned.strength).toBe(1);
    expect(week.partialStrength).toBe(2);
  });

  it("does not credit mobility, ball technique, activation or recovery as sprint or endurance", () => {
    const days = [
      training(0, ["mobility"]),
      training(1, ["skills"]),
      training(2, ["activation"]),
      training(3, ["recovery"]),
    ];
    expect(weeklyTargetCoverage(days, targets)[0]).toMatchObject({
      planned: { strength: 0, speed: 0, endurance: 0 },
      fullRestDays: 0,
    });
  });

  it("does not call a rest shell with a second session or external commitment a full rest day", () => {
    const shell = rest(0);
    shell.secondSession = training(0, ["skills"]);
    const external = { ...rest(1), externalCommitment: true };
    expect(weeklyTargetCoverage([shell, external, rest(2)], targets)[0].fullRestDays).toBe(1);
  });

  it("uses calendar offsets across a missing week instead of putting the ninth day in week one", () => {
    const result = weeklyTargetCoverage([training(15, ["speed"]), rest(0)], targets);
    expect(result.map((week) => [week.startDate, week.endDate])).toEqual([
      ["2026-11-16", "2026-11-22"],
      ["2026-11-23", "2026-11-29"],
      ["2026-11-30", "2026-12-06"],
    ]);
    expect(result.map((week) => week.fullRestDays)).toEqual([1, 0, 0]);
    expect(result.map((week) => week.planned.speed)).toEqual([0, 0, 1]);
  });

  it("preserves a midweek generator anchor and never fills missing dates as rest", () => {
    const result = weeklyTargetCoverage([rest(2), rest(4), training(9, ["endurance"])], targets);
    expect(result.map((week) => week.startDate)).toEqual(["2026-11-18", "2026-11-25"]);
    expect(result.map((week) => week.fullRestDays)).toEqual([2, 0]);
  });

  it("does not mutate input ordering or share the requested object with its caller or another week", () => {
    const plan = [training(8, ["speed"]), rest(0)];
    const before = structuredClone(plan);
    const requested = { ...targets };
    const result = weeklyTargetCoverage(plan, requested);
    expect(plan).toEqual(before);
    expect(requested).toEqual(targets);
    expect(result[0].requested).not.toBe(requested);
    expect(result[0].requested).not.toBe(result[1].requested);
  });

  it("returns no invented weeks for an empty plan or unrecognisable dates", () => {
    expect(weeklyTargetCoverage([], targets)).toEqual([]);
    expect(weeklyTargetCoverage([{ ...rest(0), date: "2026-02-31" }], targets)).toEqual([]);
  });

  it("rejects corrupt ranges and duplicate dates instead of inventing session or rest counts", () => {
    expect(weeklyTargetCoverage([rest(0), { ...rest(1), date: "9999-12-31" }], targets)).toEqual(
      [],
    );
    expect(weeklyTargetCoverage([rest(0), training(0, ["speed"])], targets)).toEqual([]);
  });
});
