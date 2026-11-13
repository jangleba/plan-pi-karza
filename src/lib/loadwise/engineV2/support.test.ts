import { describe, it, expect } from "vitest";
import {
  buildActivation,
  buildMobility,
  buildRecovery,
  buildSkills,
  hasDeclaredFootball,
} from "./support";
import { getExerciseDefinition } from "../exerciseLibrary";
import type { Profile } from "../types";
import { OWN_EQUIPMENT_OPTIONS } from "../equipmentOptions";
import { answersFromProfile, trainingFieldsFromAnswers } from "../onboardingFlow";

const profile: Profile = {
  name: "Test",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
};

describe("support session programming", () => {
  it("uses the existing onboarding equipment checklist and persists football ownership without a new question", () => {
    const football = OWN_EQUIPMENT_OPTIONS.find((label) => label === "Piłka nożna")!;
    const answers = {
      ...answersFromProfile(profile),
      goal: "general" as const,
      equipment: [football],
    };
    const stored = {
      ...profile,
      ...trainingFieldsFromAnswers(answers, profile, new Date("2026-11-13T12:00:00Z")),
    };
    expect(stored.equipment).toContain("Piłka nożna");
    expect(hasDeclaredFootball(stored)).toBe(true);
    expect(buildSkills(stored)?.roles).toEqual(["skills"]);
    const noBall = { ...stored, equipment: [], homeEquipment: [] };
    expect(buildSkills(noBall)).toBeNull();
  });
  it("keeps match-eve activation short and independent of strength/sprint targets", () => {
    const r = buildActivation(profile)!;
    expect(r.roles).toEqual(["activation"]);
    expect(r.highLower).toBe(false);
    expect(r.sprintMetres).toBe(0);
    expect(r.minutes).toBeLessThanOrEqual(18);
    expect(r.exercises.some((e) => /overcoming|nordic|deadlift/.test(e.exerciseId))).toBe(false);
    expect(
      r.exercises.filter((e) => e.role === "power").map((e) => e.dose.sets * (e.dose.reps ?? 0)),
    ).toEqual([4]);
  });
  it("honours the chosen activation venue instead of silently using another one", () => {
    const gym = buildActivation({
      ...profile,
      trainingMethodPreferences: { activationLocation: "gym" },
    })!;
    const field = buildActivation({
      ...profile,
      trainingMethodPreferences: { activationLocation: "field" },
    })!;
    expect(gym.exercises.some((e) => e.exerciseId === "bodyweight_squat")).toBe(true);
    expect(field.exercises.some((e) => e.exerciseId === "hip_mobility_flow")).toBe(true);
    expect(
      buildActivation({
        ...profile,
        hasGym: false,
        trainingMethodPreferences: { activationLocation: "gym" },
      }),
    ).toBeNull();
  });
  it("does not force jumping into a beginner without demonstrated movement preparation", () => {
    const r = buildActivation({
      ...profile,
      age: 13,
      level: "beginner",
      movementCompetence: undefined,
      strengthTrainingMonths: undefined,
      gymExperienceLevel: undefined,
    })!;
    expect(r.exercises.some((e) => e.role === "power")).toBe(false);
  });
  it("does not require barbell history for an eligible simple bodyweight activation jump", () => {
    const r = buildActivation({
      ...profile,
      level: "advanced",
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
    })!;
    expect(r.exercises.some((e) => e.exerciseId === "countermovement_jump")).toBe(true);
    expect(
      r.exercises
        .filter((e) => e.role === "power")
        .every((e) => e.dose.sets === 2 && e.dose.reps === 2),
    ).toBe(true);
    expect(
      r.exercises.every(
        (e) => !e.exerciseId.includes("depth_jump") && !e.exerciseId.includes("jump_squat"),
      ),
    ).toBe(true);
  });
  it("removes jumps and their actual time when the planner requests a gentle activation", () => {
    const regular = buildActivation(profile, "development")!;
    const gentle = buildActivation(profile, "development", false)!;
    expect(gentle.exercises.some((e) => e.role === "power")).toBe(false);
    expect(gentle.exercises).toEqual(regular.exercises.filter((e) => e.role !== "power"));
    expect(gentle.minutes).toBeLessThan(regular.minutes);
    expect(gentle.highLower).toBe(false);
  });
  it("uses the explicit mobility focus", () => {
    const r = buildMobility({ ...profile, trainingMethodPreferences: { mobilityFocus: "ankle" } })!;
    expect(r.roles).toEqual(["mobility"]);
    expect(r.exercises.every((e) => /ankle|calf|soleus/.test(e.exerciseId))).toBe(true);
    expect(r.exercises.every((e) => getExerciseDefinition(e.exerciseId)?.approved !== false)).toBe(
      true,
    );
  });
  it("does not prescribe generic recovery as injury rehabilitation", () => {
    expect(buildRecovery({ ...profile, painInjury: true })).toBeNull();
    expect(buildMobility({ ...profile, seasonPhase: "return_injury" })).toBeNull();
    const r = buildRecovery(profile)!;
    expect(r.highLower).toBe(false);
    expect(r.exercises.some((e) => e.role === "breathing")).toBe(true);
  });
  it("requires a declared football and respects unavailable equipment", () => {
    expect(buildSkills(profile)).toBeNull();
    expect(buildSkills({ ...profile, equipment: ["med_ball"] })).toBeNull();
    expect(hasDeclaredFootball({ ...profile, equipment: ["Piłka nożna"] })).toBe(true);
    expect(
      buildSkills({ ...profile, equipment: ["ball"], unavailableEquipmentIds: ["football_ball"] }),
    ).toBeNull();
  });
  it("uses the existing wall answer for solo passing and first touch without assuming a wall", () => {
    const mapped = (hasWall: boolean) => ({
      ...profile,
      ...trainingFieldsFromAnswers(
        { ...answersFromProfile(profile), hasWall, equipment: ["Piłka nożna"] },
        profile,
        new Date("2026-11-13T12:00:00Z"),
      ),
    });
    const noWall = buildSkills(mapped(false))!;
    const knownWall = buildSkills(mapped(true))!;
    expect(noWall.exercises.some((e) => e.exerciseId.includes("_wall_"))).toBe(false);
    expect(knownWall.exercises.map((e) => e.exerciseId)).toContain("football_wall_first_touch");
    expect(knownWall.exercises.map((e) => e.exerciseId)).toContain("football_wall_one_touch");
    expect(knownWall.exercises.map((e) => e.exerciseId)).not.toEqual(
      noWall.exercises.map((e) => e.exerciseId),
    );
    for (const exercise of knownWall.exercises) {
      const definition = getExerciseDefinition(exercise.exerciseId)!;
      expect(definition.approved).toBe(true);
      expect(definition.minParticipants).toBe(1);
      expect(definition.requiresPartner).not.toBe(true);
    }
    expect(buildSkills({ ...mapped(true), equipment: ["rebounder"] })).toBeNull();
  });
  it("recognises declared wall aliases and removes wall tasks when the wall is unavailable", () => {
    for (const alias of ["rebounder", "wall", "Ściana", "sciana", "odbojnik"])
      expect(
        buildSkills({ ...profile, equipment: ["Piłka nożna", alias] })!.exercises.some(
          (e) => e.exerciseId === "football_wall_first_touch",
        ),
      ).toBe(true);
    const blocked = buildSkills({
      ...profile,
      equipment: ["Piłka nożna", "rebounder"],
      unavailableEquipmentIds: ["wall"],
    })!;
    expect(blocked.exercises.some((e) => e.exerciseId.includes("_wall_"))).toBe(false);
    const keeper = buildSkills({
      ...profile,
      position: "goalkeeper",
      equipment: ["Piłka nożna", "rebounder"],
    })!;
    expect(keeper.exercises.map((e) => e.exerciseId)).toContain("football_gk_distribution");
    expect(keeper.exercises.map((e) => e.exerciseId)).toContain("football_wall_first_touch");
  });
  it("never gives goalkeeper-specific drills to an outfield player", () => {
    const p = { ...profile, equipment: ["football_ball"] };
    const outfield = buildSkills(p)!;
    const keeper = buildSkills({ ...p, position: "goalkeeper" })!;
    expect(outfield.exercises.every((e) => !e.exerciseId.startsWith("football_gk_"))).toBe(true);
    expect(keeper.exercises.some((e) => e.exerciseId.startsWith("football_gk_"))).toBe(true);
    expect(
      outfield.exercises.every((e) => getExerciseDefinition(e.exerciseId)!.minParticipants === 1),
    ).toBe(true);
  });
  it("reduces actual skill exposure during deload", () => {
    const p = { ...profile, equipment: ["football_ball"] };
    const sum = (phase: "development" | "deload") =>
      buildSkills(p, phase)!.exercises.reduce((n, e) => n + e.dose.sets * e.dose.seconds!, 0);
    expect(sum("deload")).toBeLessThan(sum("development"));
  });
});
