import { describe, expect, it } from "vitest";
import { decodeStrengthExperience, encodeStrengthExperience, hasStrengthExperience } from "./strengthExperience";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { isAdvancedEligible } from "./strengthBlocks";
import { recommendNextLoad } from "./strengthProgression";
import type { Profile } from "./types";

describe("declared strength experience", () => {
  it("round trips declarations in the existing text column without filling missing months", () => {
    const value = { gymExperienceLevel: "intermediate" as const, movementCompetence: "high" as const, supervisionLevel: "some" as const };
    expect(decodeStrengthExperience(encodeStrengthExperience(value))).toEqual(value);
    expect(hasStrengthExperience(value)).toBe(false);
    expect(decodeStrengthExperience("advanced")).toEqual({});
    expect(decodeStrengthExperience('{"schema":"ballwise-strength-v1","strengthTrainingMonths":-8}')).toEqual({});
  });
  it("does not turn elite football into gym history or movement clearance", () => {
    const athlete = buildAthleteTrainingProfile({ age: 25, level: "elite", hasGym: true });
    expect(athlete.trainingAge).toBeNull();
    expect(athlete.strengthTrainingAge).toBeNull();
    expect(athlete.gymExperienceLevel).toBe("beginner");
    expect(athlete.movementCompetenceLevel).toBe("low");
    expect(athlete.exerciseSafetyProfile.allowHeavyCompounds).toBe(false);
    expect(isAdvancedEligible({ age: 25, level: "elite", hasGym: true } as Profile)).toBe(false);
  });
  it("retains advanced work for an adult with declared experience and control", () => {
    const profile = { age: 25, level: "advanced", hasGym: true,
      gymExperienceLevel: "advanced", movementCompetence: "high", strengthTrainingMonths: 36,
      supervisionLevel: "some", seasonPhase: "offseason" } as Profile;
    expect(isAdvancedEligible(profile)).toBe(true);
    expect(isAdvancedEligible({ ...profile, movementCompetence: "low" })).toBe(false);
    expect(isAdvancedEligible({ ...profile, strengthTrainingMonths: undefined })).toBe(false);
  });
  it("does not infer permission to increase load from good logs alone", () => {
    const sets = [1, 2, 3].map(setNumber => ({ setNumber, weightKg: 60, reps: 6, rir: 4 }));
    const recommendation = recommendNextLoad([sets, sets], "6", "2", { age: 22, level: "elite" });
    expect(recommendation?.mode).toBe("repeat");
  });
});
