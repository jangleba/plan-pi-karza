import { describe, expect, it } from "vitest";
import { getAllExerciseDefinitions, getExerciseDefinition } from "../exerciseLibrary";
import type { Profile } from "../types";
import { eligibleExercise } from "./exercises";
import { meetsSessionRequirements, sessionRequirementIssue } from "./placeRequirements";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";

/** Selection and final validation use one place/partner/ball rule. */
const places = [
  { hasGym: false, hasPitch: false, hasSprintSpace: false },
  { hasGym: true, hasPitch: false, hasSprintSpace: false },
  { hasGym: false, hasPitch: true, hasSprintSpace: false },
  { hasGym: false, hasPitch: false, hasSprintSpace: true },
  { hasGym: true, hasPitch: true, hasSprintSpace: true },
];
const withPlace = (place: (typeof places)[number], equipment: string[] = []) =>
  ({ ...gymAthlete, ...place, equipment }) as Profile;

describe("one requirement rule for selection and validation", () => {
  it("an exercise the generator may select never fails the validator's place/ball/partner rule", () => {
    for (const place of places)
      for (const equipment of [[], ["football", "rebounder"]])
        for (const def of getAllExerciseDefinitions()) {
          const p = withPlace(place, equipment);
          if (eligibleExercise(def.id, p)) {
            expect(
              sessionRequirementIssue(def, p),
              `${def.id} ${JSON.stringify(place)}`,
            ).toBeNull();
          }
        }
  });

  it("distinguishes gym, pitch, open field, sprint lane, ball and partner", () => {
    const byRequirement = (space: string) =>
      getAllExerciseDefinitions().find(
        (d) => d.spaceRequirement === space && !d.requiresBall && d.minParticipants <= 1,
      );
    const gym = byRequirement("indoor_gym")!;
    const pitch = getExerciseDefinition("football_long_pass_zone")!;
    const field = byRequirement("open_field")!;
    const lane = byRequirement("sprint_lane")!;
    const none = places[0],
      gymOnly = places[1],
      pitchOnly = places[2],
      laneOnly = places[3];
    expect(sessionRequirementIssue(gym, withPlace(none))).toBe("indoor_gym");
    expect(sessionRequirementIssue(gym, withPlace(gymOnly))).toBeNull();
    // A football is declared in both cases, so the only missing thing is the pitch.
    expect(sessionRequirementIssue(pitch, withPlace(gymOnly, ["football"]))).toBe("pitch");
    expect(sessionRequirementIssue(pitch, withPlace(pitchOnly, ["football"]))).toBeNull();
    expect(sessionRequirementIssue(field, withPlace(gymOnly))).toBe("open_field");
    expect(sessionRequirementIssue(field, withPlace(pitchOnly))).toBeNull();
    // A sprint lane allows a warm-up in the open field but not a continuous run.
    expect(sessionRequirementIssue(field, withPlace(laneOnly), "warmup")).toBeNull();
    expect(sessionRequirementIssue(field, withPlace(laneOnly), "endurance")).toBe("open_field");
    expect(sessionRequirementIssue(lane, withPlace(pitchOnly))).toBe("sprint_lane");
    expect(sessionRequirementIssue(lane, withPlace(laneOnly))).toBeNull();
    const ball = getAllExerciseDefinitions().find((d) => d.requiresBall && d.minParticipants <= 1)!;
    expect(sessionRequirementIssue(ball, withPlace(places[4]))).toBe("ball");
    expect(sessionRequirementIssue(ball, withPlace(places[4], ["football"]))).not.toBe("ball");
    const partner = getAllExerciseDefinitions().find((d) => d.minParticipants > 1);
    if (partner) expect(sessionRequirementIssue(partner, withPlace(places[4]))).toBe("partner");
  });

  it("a runner without a field gets no run recipe: the unmet goal is shown, not an unactivatable plan", () => {
    const p = { ...withPlace(places[0]), goal: "endurance" } as Profile;
    const result = generateTrainingPlan(p, {
      startDate: "2026-11-02",
      weeks: 1,
      minutesPerSession: 60,
    });
    expect(
      validateTrainingPlan(result.plan, p, { startDate: "2026-11-02", minutesPerSession: 60 }),
    ).toEqual([]);
    expect(eligibleExercise("easy_aerobic_run", p)).toBe(false);
    expect(
      result.plan
        .flatMap((d) => [d, d.secondSession])
        .some((s) => s?.engineV2?.roles.includes("endurance")),
    ).toBe(false);
    expect(result.issues.some((i) => i.code.startsWith("UNMET"))).toBe(true);
    // With a field the same athlete gets a run.
    const field = { ...p, hasPitch: true } as Profile;
    expect(eligibleExercise("easy_aerobic_run", field)).toBe(true);
  });

  it("gym power variants stay behind their own equipment and place", () => {
    const def = getExerciseDefinition("gym_cmj")!;
    expect(meetsSessionRequirements(def, withPlace(places[0]))).toBe(false);
    expect(eligibleExercise("gym_cmj", withPlace(places[0]))).toBe(false);
  });
});
