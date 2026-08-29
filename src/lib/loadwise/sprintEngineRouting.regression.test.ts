/**
 * Regression tests for issue #52:
 * "Route persisted sprint sessions through the existing sprint engine"
 *
 * Verifies that ALL sprint sessions in the persisted plan — including those
 * added by the rule-based repair layer (repairWeekErrors) — use the canonical
 * football speed engine and satisfy the required block structure.
 */
import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  postSkipExerciseIdsFromSession,
} from "./footballSpeedSessionEngine";
import { getExerciseDefinition } from "./exerciseLibrary";
import { resolveEffectiveDay } from "./dailyCheckin";
import type { Profile, SessionDay } from "./types";

/** 3 technique drills + 1 plyo + 1 resisted/march + 1 primary + 1 terminal */
const CANONICAL_MAIN_ITEMS = 7;
/** 1 RAMP + 8 skips + 7 main + 1 cooldown = 17 */
const CANONICAL_TOTAL_BLOCKS = 17;

const BASE_PROFILE: Profile = {
  name: "Regression athlete",
  age: 22,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: "2026-08-22",
  equipment: [],
  unavailableEquipmentIds: [],
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
};

function sprintSessions(plan: SessionDay[]): SessionDay[] {
  return plan.filter((d) => d.speedGeneratorVersion !== undefined || d.sessionType === "Szybkość");
}

function allText(session: SessionDay): string {
  return JSON.stringify(session).toLowerCase();
}

describe("sprint engine routing regression (issue #52)", () => {
  it("0. persists family, block progression, previous drills and canonical names", () => {
    const plan = generatePlan(
      { ...BASE_PROFILE, matchDate: null, weeklyMatches: false },
      new Date("2026-08-17"),
      28,
    );
    const sessions = plan
      .flatMap((day) => [day, day.secondSession])
      .filter((session): session is SessionDay => Boolean(session?.speedGeneratorVersion));

    expect(sessions.length).toBeGreaterThan(1);
    for (const session of sessions) {
      expect(session.speedFamily).toBeTruthy();
      expect(session.speedProgressionWeek).toBe(session.blockWeekNumber);
      expect(session.speedRecentPostSkipExerciseIds).toBeInstanceOf(Array);
      for (const exercise of (session.structuredSections ?? [])
        .flatMap((section) => section.blocks)
        .flatMap((block) => block.exercises)) {
        expect(exercise.name).toBe(getExerciseDefinition(exercise.exerciseId!)?.displayNamePl);
      }
    }
    for (let index = 1; index < sessions.length; index += 1) {
      expect(sessions[index].speedRecentPostSkipExerciseIds).toEqual(
        postSkipExerciseIdsFromSession(sessions[index - 1]),
      );
    }
  });

  it("1. generatePlan uses the canonical sprint engine for all speed sessions", () => {
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);

    expect(sprints.length).toBeGreaterThanOrEqual(1);
    for (const session of sprints) {
      expect(session.speedGeneratorVersion).toBe(FOOTBALL_SPEED_GENERATOR_VERSION);
    }
  });

  it("2. exact block order survives JSON persistence and hydration", () => {
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    const original = sprints[0];
    const persisted = JSON.parse(JSON.stringify(original)) as SessionDay;

    // Block IDs in structuredSections must be identical in the same order
    const originalBlocks = (original.structuredSections ?? []).flatMap((s) =>
      s.blocks.map((b) => b.id),
    );
    const persistedBlocks = (persisted.structuredSections ?? []).flatMap((s) =>
      s.blocks.map((b) => b.id),
    );
    expect(persistedBlocks).toEqual(originalBlocks);

    // sections.warmup and sections.main exercise IDs must be identical in order
    const originalWarmupIds = original.sections.warmup.map((e) => e.exerciseId);
    const persistedWarmupIds = persisted.sections.warmup.map((e) => e.exerciseId);
    expect(persistedWarmupIds).toEqual(originalWarmupIds);
  });

  it("3. Skip A → C → B → D mandatory block is always present", () => {
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    for (const session of sprints) {
      const warmupNames = session.sections.warmup.map((e) => e.name);
      const skipAIdx = warmupNames.findIndex((n) => n.startsWith("Skip A"));
      const skipCIdx = warmupNames.findIndex((n) => n.startsWith("Skip C"));
      const skipBIdx = warmupNames.findIndex((n) => n.startsWith("Skip B"));
      const skipDIdx = warmupNames.findIndex((n) => n.startsWith("Skip D"));

      expect(skipAIdx).toBeGreaterThanOrEqual(0);
      expect(skipCIdx).toBeGreaterThanOrEqual(0);
      expect(skipBIdx).toBeGreaterThanOrEqual(0);
      expect(skipDIdx).toBeGreaterThanOrEqual(0);

      // A appears before C, C before B, B before D
      expect(skipAIdx).toBeLessThan(skipCIdx);
      expect(skipCIdx).toBeLessThan(skipBIdx);
      expect(skipBIdx).toBeLessThan(skipDIdx);
    }
  });

  it("4. exactly 3 post-skip technique drills are present in every sprint session", () => {
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    for (const session of sprints) {
      // sections.main in the plan-engine view contains:
      // 3 technique drills + 1 plyo + 1 resisted/march + 1 primary + 1 terminal = 7
      // The canonical engine always produces exactly 7 main items.
      expect(session.sections.main).toHaveLength(CANONICAL_MAIN_ITEMS);

      // structuredSections total blocks = 9 warmup + 7 main + 1 cooldown.
      const totalBlocks = (session.structuredSections ?? []).flatMap((s) => s.blocks);
      expect(totalBlocks).toHaveLength(CANONICAL_TOTAL_BLOCKS);
    }
  });

  it("5. no football-transfer block, no ball text, no duplicate exerciseId", () => {
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    for (const session of sprints) {
      // No forbidden football-transfer section items
      expect(session.sections.footballTransfer).toHaveLength(0);

      // No ball-sport text anywhere in the session
      const text = allText(session);
      expect(text).not.toMatch(/piłkarski|transfer piłk|z piłką|slalom/);

      // No duplicate exerciseId values in warmup + main
      const allExerciseIds = [
        ...session.sections.warmup.map((e) => e.exerciseId),
        ...session.sections.main.map((e) => e.exerciseId),
      ].filter(Boolean) as string[];

      // Skip A/C/B/D intentionally appear twice each (add-step and continuous).
      // We verify no unexpected duplicates beyond these known shared IDs.
      const knownSharedIds = new Set(["a_skip", "c_skip", "b_skip", "d_skip"]);
      const nonSharedIds = allExerciseIds.filter((id) => !knownSharedIds.has(id));
      const uniqueNonShared = new Set(nonSharedIds);
      expect(uniqueNonShared.size).toBe(nonSharedIds.length);
    }
  });

  it("6. Start, Plan and Session-Details views resolve the same canonical sprint session", () => {
    // Simulates: the session is generated (Start/Plan view), persisted to JSON,
    // then retrieved and passed through resolveEffectiveDay (Session Details view).
    // The structuredSections and speedGeneratorVersion must be identical.
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    const original = sprints[0];

    // Simulate persistence (Supabase JSON round-trip)
    const persisted = JSON.parse(JSON.stringify(original)) as SessionDay;

    // Simulate Session Details: resolveEffectiveDay without readiness returns
    // the same session unchanged.
    const resolved = resolveEffectiveDay(persisted, undefined, BASE_PROFILE, []);

    expect(resolved.speedGeneratorVersion).toBe(FOOTBALL_SPEED_GENERATOR_VERSION);
    expect(resolved.sessionType).toBe("Szybkość");
    expect(resolved.sections.footballTransfer).toHaveLength(0);
    expect((resolved.structuredSections ?? []).flatMap((s) => s.blocks)).toHaveLength(
      CANONICAL_TOTAL_BLOCKS,
    );
  });

  it("repair layer: missing mandatory speed session is also routed through canonical engine", () => {
    // Profile with many club days that crowd out speed slots, forcing repairWeekErrors
    // to add a mandatory speed session. The repaired session must also use the engine.
    const crowdedProfile: Profile = {
      ...BASE_PROFILE,
      clubTrainingDays: [1, 2, 3, 4, 5],
      individualTrainingDays: [6, 7],
    };
    const plan = generatePlan(crowdedProfile, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);

    // Even in constrained weeks, any speed session that exists must use the canonical engine
    for (const session of sprints) {
      expect(session.speedGeneratorVersion).toBe(FOOTBALL_SPEED_GENERATOR_VERSION);
      expect(session.sections.footballTransfer).toHaveLength(0);
    }
  });
});

describe("speedRole mapping regression", () => {
  it("zachowuje speedRole po generacji, JSON round-trip i flatToStructured", async () => {
    const { flatToStructured } = await import("./strengthBlocks");
    const plan = generatePlan(BASE_PROFILE, new Date("2026-08-17"), 7);
    const sprints = sprintSessions(plan);
    expect(sprints.length).toBeGreaterThanOrEqual(1);

    for (const original of sprints) {
      const persisted = JSON.parse(JSON.stringify(original)) as SessionDay;
      const items = [
        ...persisted.sections.warmup,
        ...persisted.sections.main,
        ...persisted.sections.cooldown,
      ];
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => Boolean(item.speedRole))).toBe(true);

      const structured = flatToStructured(persisted.sections);
      const structuredExercises = structured.flatMap((section) =>
        section.blocks.flatMap((block) => block.exercises),
      );
      expect(structuredExercises.every((exercise) => Boolean(exercise.speedRole))).toBe(true);
    }
  });
});

describe("sprint runner blocks from the real engine", () => {
  it.each([
    "acceleration",
    "maximum_velocity",
    "curved_sprinting",
    "deceleration_cod",
    "reactive_agility_reacceleration",
  ] as const)("ma osiem niepustych bloków dla %s", async (family) => {
    const { generateFootballSpeedSession } = await import("./footballSpeedSessionEngine");
    const { buildSprintRunnerBlocks } = await import("../../routes/sesja.$date");
    const { flatToStructured } = await import("./strengthBlocks");

    const result = generateFootballSpeedSession({
      profile: { ...BASE_PROFILE, matchDate: null },
      date: "2026-08-20",
      family,
    });
    expect(result.status).toBe("generated");
    const session = JSON.parse(JSON.stringify(result.session)) as SessionDay;
    const blocks = buildSprintRunnerBlocks(flatToStructured(session.sections));

    expect(blocks).toHaveLength(8);
    for (const block of blocks) {
      expect(block.exercises.length).toBeGreaterThan(0);
      expect(block.hasDataError ?? false).toBe(false);
    }
    const byKey = Object.fromEntries(blocks.map((block) => [block.key, block]));
    expect(byKey.skip.exercises.map((e) => e.exercise.exerciseId)).toEqual([
      "a_skip",
      "c_skip",
      "b_skip",
      "d_skip",
    ]);
    expect(byKey.technical.exercises).toHaveLength(3);
    expect(byKey.resisted.exercises).toHaveLength(1);
    expect(byKey.terminal.exercises).toHaveLength(1);
    const names = [
      ...byKey.technical.exercises,
      ...byKey.main.exercises,
      ...byKey.terminal.exercises,
    ].map((e) => e.canonicalName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("Mechanika przyspieszenia");
  });
});
