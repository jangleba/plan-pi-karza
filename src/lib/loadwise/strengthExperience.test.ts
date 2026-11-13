import { describe,expect,it } from "vitest";
import { decodeStrengthExperience,encodeStrengthExperience,hasStrengthExperience } from "./strengthExperience";
import { buildAthleteTrainingProfile } from "./athleteProfile";

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
  });
});
