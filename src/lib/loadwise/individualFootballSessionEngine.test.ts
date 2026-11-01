import { describe, expect, it } from "vitest";
import { buildIndividualFootballSession, INDIVIDUAL_FOOTBALL_DRILLS } from "./individualFootballSessionEngine";
import { buildFootball, buildRunningConditioning, enforceSessionCategory, newContentCounters, validateGeneratedSession } from "./sessionContent";
import { canonicalizeGeneratedExercise, getExerciseDefinition, migratePersistedExerciseData } from "./exerciseLibrary";
import { generatePlan } from "./planEngine";
import { classifySession } from "./sessionClassification";
import { flatToStructured } from "./strengthBlocks";
import { fieldsForMetric, metricKindForExercise } from "./exerciseMetrics";
import type { Profile, SessionDay } from "./types";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Football fixture", age: 22, position: "midfielder", level: "intermediate",
    goal: "general", secondaryLimiter: "ball", clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7], usualMatchDay: null,
    matchDate: null, matchDates: [], equipment: [], painInjury: false,
    doubleSessionsAllowed: "no", guardianConsent: true, onboardingComplete: true,
    createdAt: "2026-11-01", seasonPhase: "preseason", seasonStage: null,
    competitionLevel: "iv_liga", weeklyMatches: false, seasonPhaseOverride: true,
    hasGym: false, hasPitch: false, hasSprintSpace: false, ...overrides,
  };
}

function asSession(built: ReturnType<typeof buildFootball>): SessionDay {
  return {
    date: "2026-11-02", dayName: "Poniedziałek", dayType: "training",
    goalLabel: "Piłka", intensity: built.intensity ?? "umiarkowana",
    durationMin: built.durationMin ?? 30, reason: "Technika", secondSession: null,
    safetyNote: "Kontrola przed intensywnością.", whyToday: "Technika indywidualna.",
    mdLabel: null, slotLabel: null,
    ...built,
  };
}

function rows(built: ReturnType<typeof buildIndividualFootballSession>) {
  return Object.values(built.sections).flat();
}

describe("individual football: solo conditions and real runtime", () => {
  it("logs timed football bouts without asking for weights, repetitions or RIR", () => {
    const built = buildFootball(profile(), { seed: 0 });
    const exercises = flatToStructured(built.sections).flatMap((section) => section.blocks.flatMap((block) => block.exercises));
    expect(exercises.length).toBeGreaterThan(0);
    for (const exercise of exercises) {
      expect(metricKindForExercise(exercise)).toBe("time");
      expect(fieldsForMetric(metricKindForExercise(exercise))).toEqual([{ id: "value", label: "Czas", suffix: "s", step: 1 }]);
    }
  });
  it("retains the MAS eligibility requirement and gives an easy run when competence is unknown", () => {
    const unknown = buildRunningConditioning(profile(), { seed: 0, scheduleFieldMasTest: true, date: "2026-11-02" });
    expect(unknown.title).toBe("Spokojny bieg tlenowy");
    expect(unknown.intensity).toBe("niska");
    const eligible = buildRunningConditioning(profile({ movementCompetence: "medium" }), { seed: 0, scheduleFieldMasTest: true, date: "2026-11-02" });
    expect(eligible.title).toBe("Test biegowy 5 min");
  });

  it("does not restore an ineligible MAS test through weekly minimum repairs", () => {
    const plan = generatePlan(profile({
      goal: "strength", secondaryLimiter: null, hasGym: false,
      hasPitch: true, hasSprintSpace: true,
    }), new Date("2026-11-02T00:00:00"), 28);
    const sessions = plan.flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])]);
    const exercises = sessions.flatMap((session) => Object.values(session.sections).flat());
    expect(exercises.some((exercise) => exercise.exerciseId === "field_mas_5_min_test")).toBe(false);
    expect(sessions.some((session) => classifySession(session).category === "endurance_conditioning")).toBe(true);
  });
  it("does not assume a wall, teammate or goal when the profile has no equipment", () => {
    const built = buildIndividualFootballSession(profile(), { seed: 0 });
    expect(rows(built).some((row) => row.exerciseId === "football_wall_first_touch")).toBe(false);
    expect(rows(built).some((row) => row.exerciseId === "football_self_feed_first_touch")).toBe(true);
    expect(rows(built).every((row) => row.instructionSteps?.length === 3)).toBe(true);
    expect(rows(built).every((row) => row.purpose && row.commonMistake && row.easier)).toBe(true);
    expect(validateGeneratedSession(asSession(built), "football")).toMatchObject({ valid: true });
  });

  it("uses a wall task only after wall access is declared, and honors unavailable equipment", () => {
    const withWall = buildIndividualFootballSession(profile({ equipment: ["ściana/odbojnik"] }), { seed: 0 });
    expect(rows(withWall).some((row) => row.exerciseId === "football_wall_first_touch")).toBe(true);
    const blocked = buildIndividualFootballSession(profile({ equipment: ["ściana/odbojnik"], unavailableEquipmentIds: ["odbojnik"] }), { seed: 0 });
    expect(rows(blocked).some((row) => row.exerciseId === "football_wall_first_touch")).toBe(false);
  });

  it("keeps a distinct position task without inventing pressure, a goalkeeper or a goal", () => {
    const expected = {
      goalkeeper: "football_gk_distribution", defender: "football_target_pass",
      midfielder: "football_scan_control", forward: "football_turn_control",
    } as const;
    for (const position of Object.keys(expected) as Profile["position"][]) {
      const built = buildIndividualFootballSession(profile({ position }), { seed: 0 });
      expect(built.sections.footballTransfer[0].exerciseId).toBe(expected[position]);
      expect(built.sections.footballTransfer[0].purpose).toMatch(/10/);
      expect(built.sessionType).toContain("indywidualna");
      expect(classifySession(asSession(built)).category).toBe("other");
    }
  });

  it("allocates time to work, rests and setup rather than keeping a conflicting template duration", () => {
    for (const durationMin of [15, 20, 25, 30, 40, 90]) {
      const built = buildIndividualFootballSession(profile(), { seed: 0, durationMin });
      const warm = Number(built.sections.warmup[0].prescription.match(/^(\d+)/)![1]);
      const cool = Number(built.sections.cooldown[0].prescription.match(/^(\d+)/)![1]);
      const practices = [...built.sections.main, ...built.sections.footballTransfer];
      const blockTotal = practices.reduce((sum, row) => sum + Number(row.prescription.match(/blok (\d+) min/)![1]), 0);
      expect(warm + cool + blockTotal).toBe(built.durationMin);
      for (const row of practices) {
        const [sets, work, rest, block] = row.prescription.match(/\d+/g)!.map(Number);
        expect(sets * work + (sets - 1) * rest).toBeLessThanOrEqual(block * 60);
      }
    }
  });

  it("caps novice and cautious dose, and uses quality rather than calendar to advance difficulty", () => {
    const novice = buildIndividualFootballSession(profile({ age: 14, level: "beginner" }), { seed: 0 });
    const regular = buildIndividualFootballSession(profile(), { seed: 0 });
    const returning = buildIndividualFootballSession(profile({ goal: "return" }), { seed: 0 });
    expect(novice.durationMin).toBeLessThan(regular.durationMin);
    expect(novice.intensity).toBe("niska");
    expect(returning.durationMin).toBeLessThanOrEqual(25);
    expect(returning.sections.footballTransfer).toEqual([]);
    expect(regular.sections.main.every((row) => row.harder?.includes("dwóch seriach"))).toBe(true);
    expect(buildIndividualFootballSession(profile(), { seed: 0, weekIndex: 3 })).toEqual(regular);
  });

  it("preserves the actual drill name and instructions after canonicalization and hydration", () => {
    const built = buildFootball(profile(), { seed: 0 });
    const before = asSession(built);
    before.sections = Object.fromEntries(Object.entries(before.sections).map(([key, list]) => [key, list.map((row) => canonicalizeGeneratedExercise(row))])) as SessionDay["sections"];
    const hydrated = migratePersistedExerciseData(JSON.parse(JSON.stringify([before]))).plan[0];
    expect(hydrated.sections.main.map((row) => row.name)).toEqual(built.sections.main.map((row) => row.name));
    expect(hydrated.sections.main.map((row) => row.instructionSteps)).toEqual(built.sections.main.map((row) => row.instructionSteps));
    for (const definition of INDIVIDUAL_FOOTBALL_DRILLS) {
      expect(getExerciseDefinition(definition.id)).toMatchObject({ approved: true, requiresBall: true, participantMode: "solo" });
    }
  });

  it("wires the new engine into category enforcement and generated plans", () => {
    const p = profile();
    const session = asSession(buildFootball(p, { seed: 0 }));
    session.durationMin = 20;
    enforceSessionCategory(session, p, { counters: newContentCounters(), weekIndex: 0 });
    expect(session.durationMin).toBe(20);
    expect(session.sections.main.every((row) => row.exerciseId?.startsWith("football_"))).toBe(true);
    const plan = generatePlan(p, new Date("2026-11-02T00:00:00"), 28);
    const technical = plan.flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])]).filter((day) => day.sessionType === "Piłka / technika indywidualna");
    expect(technical.length).toBeGreaterThan(0);
    expect(technical.every((day) => day.sections.main.every((row) => row.exerciseId?.startsWith("football_")))).toBe(true);
  });
});
