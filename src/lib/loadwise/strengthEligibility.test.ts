import { describe, expect, it } from "vitest";
import { enforceStrengthEligibility } from "./strengthEligibility";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "./exerciseLibrary";
import type { Profile, TrainingExercise } from "./types";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";

const profile = (overrides: Partial<Profile> = {}) => ({
  age: 14, level: "elite", hasGym: true, equipment: [], homeEquipment: [],
  painInjury: false, seasonPhase: "offseason", ...overrides,
}) as Profile;
function session(exercises: TrainingExercise[]) {
  return sessionFixture({ title: "Siła", sessionType: "Siłownia", structuredSections: [sectionFixture("main", exercises)] });
}
const heavy: TrainingExercise = { id: "lift-1", exerciseId: "heavy_back_squat", name: "Przysiad ze sztangą", sets: "4", reps: "3", loadTarget: "85% 1RM", displayPrescription: "4 × 3 · 85% 1RM" };

describe("final strength variant gate", () => {
  it("replaces a blocked canonical variant without removing the exercise or inheriting heavy load", () => {
    const p = profile(); const result = enforceStrengthEligibility(session([heavy]), p);
    const exercises = result.structuredSections![0].blocks[0].exercises;
    expect(exercises).toHaveLength(1);
    const next = exercises[0];
    expect(next.id).toBe(heavy.id);
    expect(next.exerciseId).not.toBe(heavy.exerciseId);
    expect(next.loadTarget).not.toContain("85%");
    expect(next.displayPrescription).toBeUndefined();
    expect(isExerciseAllowedForProfile(next.exerciseId, buildAthleteTrainingProfile(p)).ok).toBe(true);
    expect(getExerciseDefinition(next.exerciseId!)?.movementPattern).toBe("squat");
    expect(enforceStrengthEligibility(result, p)).toBe(result);
  });
  it("preserves a qualified adult's main lift", () => {
    const current = session([heavy]);
    const p = profile({ age: 24, gymExperienceLevel: "advanced", strengthTrainingMonths: 36, movementCompetence: "high", supervisionLevel: "some" });
    expect(enforceStrengthEligibility(current, p)).toBe(current);
  });
  it("does not give a minor a full Nordic based on football level", () => {
    const result = enforceStrengthEligibility(session([{ id: "n", exerciseId: "full_nordic_hamstring", name: "Nordic hamstring pełny", sets: "3", reps: "5" }]), profile());
    const next = result.structuredSections![0].blocks[0].exercises[0];
    expect(next.exerciseId).not.toBe("full_nordic_hamstring");
    expect(next.executionBlockedReason || next.wasAdjustedForAthleteProfile).toBeTruthy();
  });
  it("checks the second slot and leaves external club content alone", () => {
    const second = session([heavy]);
    const club = { ...sessionFixture({ dayType: "club", externalCommitment: true }), secondSession: second };
    const result = enforceStrengthEligibility(club, profile());
    expect(result.dayType).toBe("club");
    expect(result.secondSession?.structuredSections![0].blocks[0].exercises[0].exerciseId).not.toBe(heavy.exerciseId);
  });
  it("keeps an unresolved item visible and explicitly blocks execution", () => {
    const result = enforceStrengthEligibility(session([heavy]), profile({ age: 7 }));
    const next = result.structuredSections![0].blocks[0].exercises[0];
    expect(next.executionBlockedReason).toBeTruthy();
  });
});
