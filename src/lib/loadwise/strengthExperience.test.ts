import { describe, expect, it } from "vitest";
import {
  decodeStrengthExperience,
  encodeStrengthExperience,
  hasStrengthExperience,
} from "./strengthExperience";
import { buildAthleteTrainingProfile } from "./athleteProfile";

describe("declared strength experience", () => {
  it("round trips declarations in the existing text column without filling missing months", () => {
    const value = {
      gymExperienceLevel: "intermediate" as const,
      movementCompetence: "high" as const,
      supervisionLevel: "some" as const,
    };
    expect(decodeStrengthExperience(encodeStrengthExperience(value))).toEqual(value);
    expect(hasStrengthExperience(value)).toBe(false);
    expect(decodeStrengthExperience("advanced")).toEqual({});
    expect(
      decodeStrengthExperience('{"schema":"ballwise-strength-v1","strengthTrainingMonths":-8}'),
    ).toEqual({});
  });
  it("preserves the adaptive sports structure without inventing experience or loads", () => {
    const value = { trainingMethodPreferences: { gymTemplate: "athletic_ab" as const } };
    expect(decodeStrengthExperience(encodeStrengthExperience(value))).toEqual(value);
    expect(
      decodeStrengthExperience(
        '{"schema":"ballwise-strength-v1","trainingMethodPreferences":{"gymTemplate":"unknown"}}',
      ).trainingMethodPreferences,
    ).toEqual({});
  });
  it("16+ advanced by default: regular-training defaults, but no invented months, coach or heavy-lift clearance", () => {
    const athlete = buildAthleteTrainingProfile({ age: 25, level: "elite", hasGym: true });
    expect(athlete.trainingAge).toBeNull();
    expect(athlete.strengthTrainingAge).toBeNull();
    expect(athlete.gymExperienceLevel).toBe("intermediate");
    expect(athlete.movementCompetenceLevel).toBe("medium");
    expect(athlete.supervisionLevel).toBe("none");
    expect(athlete.exerciseSafetyProfile.allowHeavyCompounds).toBe(false);
    // Younger (existing) accounts keep the cautious defaults.
    const young = buildAthleteTrainingProfile({ age: 15, level: "elite", hasGym: true });
    expect(young.gymExperienceLevel).toBe("beginner");
    expect(young.movementCompetenceLevel).toBe("low");
    // An intermediate football level is not "advanced by default".
    const intermediate = buildAthleteTrainingProfile({
      age: 20,
      level: "intermediate",
      hasGym: true,
    });
    expect(intermediate.movementCompetenceLevel).toBe("low");
  });
});
