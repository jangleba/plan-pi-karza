import { describe, expect, it } from "vitest";
import type { Profile } from "./types";
import { generateFootballSpeedSession } from "./footballSpeedSessionEngine";
import { applyReadiness } from "./planEngine";
import { classifySession } from "./sessionClassification";
import { getExerciseDefinition } from "./exerciseLibrary";

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 4, 6],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  unavailableEquipmentIds: ["sled", "box"],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  ...overrides,
});

describe("football speed session engine", () => {
  it("keeps the mandatory A → C → B → D skips and three rotating drills", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
    });
    expect(result.status).toBe("generated");
    expect(result.exercises.filter((e) => e.role === "primer").map((e) => e.exerciseId)).toEqual([
      "a_skip",
      "c_skip",
      "b_skip",
      "d_skip",
      "a_skip",
      "c_skip",
      "b_skip",
      "d_skip",
    ]);
    expect(result.exercises.filter((e) => e.role === "technical")).toHaveLength(3);
    expect(
      result.exercises.filter((e) => e.role === "technical").every((e) => e.sets === "2"),
    ).toBe(true);
    expect(result.exercises.every((e) => e.equipment.replacementStatus !== "blocked")).toBe(true);
    expect(result.exercises.some((e) => e.role === "secondary")).toBe(true);
    expect(result.exercises.filter((e) => e.role === "resisted")).toHaveLength(1);
    expect(result.exercises.find((e) => e.role === "resisted")?.exerciseId).toBe("wall_march");
    expect(result.session?.sections.main).toHaveLength(8);
    expect(result.session?.sections.cooldown).toHaveLength(1);
    expect(result.session?.structuredSections?.flatMap((section) => section.blocks)).toHaveLength(
      18,
    );
  });

  it("uses sled only when the athlete explicitly declares it available", () => {
    const withoutSled = generateFootballSpeedSession({
      profile: profile({ equipment: [] }),
      date: "2026-08-20",
      family: "acceleration",
    });
    const withSled = generateFootballSpeedSession({
      profile: profile({ equipment: ["sled"], unavailableEquipmentIds: [] }),
      date: "2026-08-20",
      family: "acceleration",
    });

    expect(withoutSled.exercises.find((e) => e.role === "resisted")?.exerciseId).toBe("wall_march");
    expect(withSled.exercises.find((e) => e.role === "resisted")?.exerciseId).toBe(
      "resisted_sled_acceleration",
    );
  });

  it("uses the approved Polish library name for every visible exercise", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
    });
    for (const exercise of result.exercises) {
      expect(exercise.name).toBe(getExerciseDefinition(exercise.exerciseId)?.displayNamePl);
    }
  });

  it.each([
    ["acceleration", "scissor_bounds"],
    ["maximum_velocity", "bilateral_pogo"],
    ["curved_sprinting", "lateral_pogo"],
    ["deceleration_cod", "snap_down"],
    ["reactive_agility_reacceleration", "lateral_bound_to_stick"],
  ] as const)("matches plyometrics to the %s family", (family, exerciseId) => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family,
    });
    expect(result.exercises.find((exercise) => exercise.role === "secondary")?.exerciseId).toBe(
      exerciseId,
    );
  });

  it("rotates the post-skip trio from progression and recent-session inputs", () => {
    const base = { profile: profile(), date: "2026-08-20", family: "acceleration" as const };
    const first = generateFootballSpeedSession({ ...base, progressionWeek: 1 });
    const second = generateFootballSpeedSession({
      ...base,
      progressionWeek: 1,
      recentPostSkipExerciseIds: first.exercises
        .filter((e) => e.role === "technical")
        .map((e) => e.exerciseId),
    });
    expect(
      second.exercises.filter((e) => e.role === "technical").map((e) => e.exerciseId),
    ).not.toEqual(first.exercises.filter((e) => e.role === "technical").map((e) => e.exerciseId));
  });

  it("uses two complementary main tasks and rotates the acceleration start by week", () => {
    const week1 = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
      progressionWeek: 1,
    });
    const week2 = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-27",
      family: "acceleration",
      progressionWeek: 2,
    });

    expect(week1.exercises.filter((exercise) => exercise.role === "primary")).toHaveLength(2);
    expect(
      week1.exercises.filter((exercise) => exercise.role === "primary").map((e) => e.exerciseId),
    ).toEqual(["falling_start", "free_acceleration_sprint"]);
    expect(
      week2.exercises.filter((exercise) => exercise.role === "primary").map((e) => e.exerciseId),
    ).toEqual(["split_stance_start", "free_acceleration_sprint"]);
    for (const exercise of week1.exercises) {
      const definition = getExerciseDefinition(exercise.exerciseId);
      expect(definition?.instructionsPl?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each([
    ["maximum_velocity", "flying_sprint"],
    ["curved_sprinting", "football_curved_sprint"],
    ["deceleration_cod", "progressive_deceleration_5_10_15"],
    ["reactive_agility_reacceleration", "app_audio_forward_left_right"],
  ] as const)("selects the approved primary for %s", (family, exerciseId) => {
    const result = generateFootballSpeedSession({ profile: profile(), date: "2026-08-20", family });
    expect(result.primaryExerciseId).toBe(exerciseId);
    expect(result.exercises.some((e) => e.exerciseId === exerciseId)).toBe(true);
    expect(result.secondaryExerciseId).toBe(
      result.exercises.find((exercise) => exercise.role === "terminal")?.exerciseId,
    );
    expect(result.primaryExerciseId).not.toBe(result.secondaryExerciseId);
  });

  it("protects MD, MD-1 and MD+1", () => {
    const match = profile({ matchDate: "2026-08-20" });
    expect(
      generateFootballSpeedSession({ profile: match, date: "2026-08-20", family: "acceleration" })
        .status,
    ).toBe("blocked");
    expect(
      generateFootballSpeedSession({ profile: match, date: "2026-08-21", family: "acceleration" })
        .status,
    ).toBe("blocked");
    expect(
      generateFootballSpeedSession({
        profile: match,
        date: "2026-08-19",
        family: "maximum_velocity",
      }).status,
    ).toBe("blocked");
  });

  it("does not treat an adjacent club training as a hard sprint conflict", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
      externalSessions: [{ date: "2026-08-19", kind: "club", hard: true }],
    });
    expect(result.status).toBe("generated");
  });

  it("allows a same-day club plus sprint only for an eligible double-session athlete", () => {
    const exposure = [{ date: "2026-08-20", kind: "club" as const, hard: true }];
    expect(
      generateFootballSpeedSession({
        profile: profile({ doubleSessionsAllowed: "yes_if_safe" }),
        date: "2026-08-20",
        family: "acceleration",
        externalSessions: exposure,
      }).status,
    ).toBe("generated");
    expect(
      generateFootballSpeedSession({
        profile: profile({ level: "beginner", doubleSessionsAllowed: "yes_if_safe" }),
        date: "2026-08-20",
        family: "acceleration",
        externalSessions: exposure,
      }).status,
    ).toBe("blocked");
  });

  it("reduces volume for low readiness without conditioning or RSA", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "maximum_velocity",
      readiness: 4,
    });
    expect(result.exercises.filter((e) => e.role === "technical").length).toBe(3);
    expect(result.exercises.some((e) => e.exerciseId.includes("repeated"))).toBe(false);
    expect(result.excludedExerciseIds.length).toBeGreaterThan(0);
    expect(result.status).toBe("activation");
    expect(result.exercises.find((e) => e.role === "primary")?.dose).toBe(
      "2 × 20 m z najazdu 15 m",
    );
    expect(result.exercises.find((e) => e.role === "primary")?.intensity).toContain("75–85%");
  });

  it("keeps sprint intensity and reduces dose at readiness 6–7", () => {
    const full = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
    });
    const reduced = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
      readiness: 6,
    });

    expect(full.exercises.find((e) => e.exerciseId === "free_acceleration_sprint")?.dose).toBe(
      "4–6 × 10–20 m",
    );
    expect(reduced.exercises.find((e) => e.exerciseId === "free_acceleration_sprint")?.dose).toBe(
      "3 × 10–15 m",
    );
    expect(
      reduced.exercises.find((e) => e.exerciseId === "free_acceleration_sprint")?.intensity,
    ).toBe("maksymalna jakość");
    expect(reduced.session?.durationMin).toBeLessThan(full.session?.durationMin ?? 0);
  });

  it("regenerates the persisted canonical session when the daily check-in reduces volume", () => {
    const base = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
      progressionWeek: 3,
      recentPostSkipExerciseIds: ["a_switch_progression", "a_accent", "alternate_leg_bounds"],
    }).session!;
    const baseTechnicalIds = base.structuredSections
      ?.flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises)
      .filter((exercise) => exercise.speedRole === "technical")
      .map((exercise) => exercise.exerciseId);
    const adjusted = applyReadiness(
      base,
      {
        date: "2026-08-20",
        sleep: 7,
        energy: 6,
        fatigue: 6,
        soreness: 4,
        jointPain: 1,
        stress: 4,
        motivation: 7,
        overall: 6,
      },
      profile(),
    ).session;

    expect(base.speedGeneratorVersion).toBeTruthy();
    expect(classifySession(base).isSpeed).toBe(true);
    expect(
      adjusted.sections.main.find((e) => e.exerciseId === "free_acceleration_sprint")?.prescription,
    ).toBe("3 × 10–15 m");
    expect(adjusted.structuredSections?.flatMap((section) => section.blocks)).toHaveLength(18);
    expect(adjusted.sections.cooldown).toHaveLength(1);
    expect(adjusted.speedFamily).toBe("acceleration");
    expect(adjusted.speedProgressionWeek).toBe(3);
    expect(
      adjusted.structuredSections
        ?.flatMap((section) => section.blocks)
        .flatMap((block) => block.exercises)
        .filter((exercise) => exercise.speedRole === "technical")
        .map((exercise) => exercise.exerciseId),
    ).toEqual(baseTechnicalIds);
  });

  it("is deterministic and follows the pain stop path", () => {
    const input = { profile: profile(), date: "2026-08-20", family: "curved_sprinting" as const };
    expect(generateFootballSpeedSession(input)).toEqual(generateFootballSpeedSession(input));
    const blocked = generateFootballSpeedSession({ ...input, pain: ["hamstring"] });
    expect(blocked.status).toBe("blocked");
    expect(blocked.safetyNote).toMatch(/Ból/);
  });
});
