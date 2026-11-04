import { describe, expect, it } from "vitest";
import {
  applyStrengthProgramming,
  estimateStrengthMinutes,
  selectStrengthMethod,
} from "./strengthProgramming";
import {
  buildStrengthPowerStructured,
  filterUnavailableEquipment,
  classifyExercise,
  repairGymSession,
  structuredToFlat,
  validateGymSession,
  type StrengthBlockContext,
} from "./strengthBlocks";
import { enforceStrengthEligibility } from "./strengthEligibility";
import { resolveExecutionDay } from "./effectivePlan";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition, isExerciseAllowedForProfile } from "./exerciseLibrary";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, TrainingExercise } from "./types";
import { generatePlan } from "./planEngine";
import { validatePlanExerciseContract } from "./planExerciseContract";
const base = {
  name: "Test",
  secondaryLimiter: null,
  individualTrainingDays: [2, 4, 5],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-03",
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasPitch: true,
  hasSprintSpace: true,
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "power",
  clubTrainingDays: [1, 3],
  hasGym: true,
  equipment: [],
  homeEquipment: [],
  painInjury: false,
  seasonPhase: "inseason",
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "some",
} as Profile;
const ctx: StrengthBlockContext = {
  mdLabel: "MD-5",
  weekPhase: "development",
  weekIndex: 1,
  gymSessionIndexInWeek: 0,
  gymSessionsThisWeekTotal: 2,
  readiness: 8,
  powerFocus: true,
  history: { usedRolesThisWeek: [], usedMainThisWeek: [], usedMainLastWeek: [] },
};
const all = (s: ReturnType<typeof sessionFixture>) =>
  s.structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
describe("strength programming repair", () => {
  it("classifies canonical curls regardless of a Polish or shortened display name", () => {
    expect(classifyExercise({ id: "x", exerciseId: "seated_leg_curl", name: "Uginanie nóg" })).toBe(
      "hamstring",
    );
    expect(
      classifyExercise({ id: "x", exerciseId: "standing_calf_raise", name: "Wspięcia na palce" }),
    ).toBe("calf");
  });
  it("does not turn football experience into gym experience", () => {
    expect(
      selectStrengthMethod(
        {
          ...base,
          gymExperienceLevel: undefined,
          strengthTrainingMonths: undefined,
          movementCompetence: undefined,
        },
        ctx,
      ).method,
    ).toBe("foundation");
    expect(selectStrengthMethod({ ...base, level: "beginner" }, ctx).method).toBe("contrast");
    expect(
      selectStrengthMethod(
        { ...base, gymExperienceLevel: "intermediate", strengthTrainingMonths: 12 },
        ctx,
      ).method,
    ).toBe("power_first");
    expect(selectStrengthMethod({ ...base, goal: "strength" }, ctx).method).toBe("straight_sets");
  });
  it.each([{ age: 17 }, { strengthTrainingMonths: 5 }, { movementCompetence: "low" as const }])(
    "does not unlock contrasts from an incomplete or unsuitable profile: %o",
    (over) => {
      expect(selectStrengthMethod({ ...base, ...over }, ctx).method).not.toBe("contrast");
    },
  );
  it.each([
    { weekPhase: "adaptation" },
    { weekPhase: "deload" },
    { mdLabel: "MD-3" },
    { readiness: 5 },
  ])("does not prescribe a contrast when the day calls for simpler work: %o", (over) => {
    expect(selectStrengthMethod(base, { ...ctx, ...over }).method).not.toBe("contrast");
  });
  it("uses exactly one matched contrast with equal rounds and both intra-pair and post-pair rest", () => {
    const p = buildStrengthPowerStructured(base, ctx)!;
    const pairs = p.sections.flatMap((s) => s.blocks).filter((b) => b.blockType === "contrast");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].exercises.map((e) => e.sets)).toEqual(["3", "3"]);
    expect(pairs[0].exercises[0].restAfterExercise).toBe("3 min");
    expect(pairs[0].exercises[1].restAfterPair).toBe("3 min");
  });
  it("repairs legacy duplicates and stale basic-exercise blocks without changing the stored source", () => {
    const curl = (id: string): TrainingExercise => ({
      id,
      exerciseId: "seated_leg_curl",
      name: "Uginanie nóg",
      sets: "2",
      reps: "6–8",
      executionBlockedReason: "old",
    });
    const sections = [
      sectionFixture("main", [
        curl("a"),
        curl("b"),
        curl("c"),
        {
          id: "calf",
          exerciseId: "standing_calf_raise",
          name: "Wspięcia na palce",
          sets: "2",
          reps: "12",
          executionBlockedReason: "old",
        },
      ]),
    ];
    const source = sessionFixture({
      dbId: "old",
      title: "Siłownia: siła dolna",
      sessionType: "Siła",
      structuredSections: sections,
      sections: structuredToFlat(sections),
    });
    const original = JSON.stringify(source);
    const profile = {
      ...base,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
    };
    const repaired = resolveExecutionDay(source, { profile });
    expect(all(repaired).map((e) => e.exerciseId)).toEqual([
      "seated_leg_curl",
      "standing_calf_raise",
    ]);
    expect(all(repaired).some((e) => e.executionBlockedReason)).toBe(false);
    expect(repaired.sections.main).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(original);
    expect(enforceStrengthEligibility(repaired, profile)).toBe(repaired);
    for (const status of ["started", "completed"] as const) {
      const actual = resolveExecutionDay(source, {
        profile,
        completions: {
          old: {
            completed: status === "completed",
            status,
            rpe: 5,
            notes: "",
            executionSnapshot: source,
          },
        },
      });
      expect(all(actual)).toHaveLength(4);
    }
  });
  it("does not append the same missing-hamstring repair repeatedly from stale issues", () => {
    const plan = buildStrengthPowerStructured(base, ctx)!;
    const issue = { code: "missing_hamstring" as const, message: "legacy" };
    const before = plan.sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises)).length;
    repairGymSession(plan, ctx, [issue]);
    repairGymSession(plan, ctx, [issue]);
    expect(plan.sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises))).toHaveLength(before);
  });
  it("estimates work, rests and preparation instead of clamping a larger session to its title", () => {
    const basic = [
      sectionFixture("main", [
        {
          id: "a",
          exerciseId: "goblet_squat",
          name: "Przysiad",
          sets: "3",
          reps: "8",
          restAfterExercise: "3 min",
        },
      ]),
    ];
    const more = [sectionFixture("main", [{ ...basic[0].blocks[0].exercises[0], sets: "8" }])];
    expect(estimateStrengthMinutes(more)).toBeGreaterThan(estimateStrengthMinutes(basic));
    const programmed = applyStrengthProgramming(basic, { method: "straight_sets", reason: "test" });
    expect(applyStrengthProgramming(programmed, { method: "straight_sets", reason: "test" })).toBe(
      programmed,
    );
  });
  it("separates a regressed bodyweight lift from power rather than keeping a false contrast", () => {
    const sections = [
      sectionFixture("main", [
        {
          id: "squat",
          label: "A1",
          exerciseId: "bodyweight_squat",
          name: "Przysiad",
          sets: "3",
          reps: "6",
        },
        {
          id: "jump",
          label: "A2",
          exerciseId: "countermovement_jump",
          name: "Skok",
          sets: "3",
          reps: "3",
        },
      ]),
    ];
    sections[0].blocks[0].blockType = "contrast";
    const actual = applyStrengthProgramming(sections, { method: "contrast", reason: "test" });
    expect(actual[0].blocks.every((b) => b.blockType === "single")).toBe(true);
  });
  it("does not transfer old weights, doses or instructions into an equipment replacement", () => {
    const sections = [
      sectionFixture("main", [
        {
          id: "a",
          exerciseId: "barbell_deadlift",
          name: "Martwy ciąg ze sztangą",
          sets: "4",
          reps: "2–4",
          loadTarget: "90% 1RM",
          visualId: "barbell_deadlift",
          instructionSteps: [{ title: "Stare", description: "Stara instrukcja" }],
        },
      ]),
    ];
    const actual = filterUnavailableEquipment(sections, {
      ...base,
      unavailableEquipmentIds: [
        "barbell",
        "trap_bar",
        "dumbbell",
        "kettlebell",
        "machine",
        "band",
        "cable",
      ],
    })[0].blocks[0].exercises[0];
    expect(actual.exerciseId).not.toBe("barbell_deadlift");
    expect(actual.visualId).toBe(actual.exerciseId);
    expect(actual.loadTarget).not.toMatch(/90%|1RM/);
    expect(actual.sets).toBe("2");
    expect(actual.instructionSteps).not.toEqual(
      sections[0].blocks[0].exercises[0].instructionSteps,
    );
  });
  it("keeps the actual 28-day planner usable with missing equipment and different gym experience", () => {
    for (const age of [13, 17, 24])
      for (const gym of ["unknown", "advanced"])
        for (const goal of [
          "general",
          "strength",
          "speed",
          "power",
          "agility",
          "endurance",
        ] as const)
          for (const unavailable of [[], ["barbell", "trap_bar", "machine", "band", "cable"]]) {
            const profile: Profile = {
              ...base,
              age,
              goal,
              usualMatchDay: null,
              matchDate: null,
              weeklyMatches: false,
              seasonPhase: "preseason",
              seasonPhaseOverride: true,
              unavailableEquipmentIds: unavailable,
              gymExperienceLevel: gym === "unknown" ? undefined : "advanced",
              strengthTrainingMonths: gym === "unknown" ? undefined : 36,
              movementCompetence: gym === "unknown" ? undefined : "high",
              supervisionLevel: age < 18 ? "full" : "some",
            };
            const plan = generatePlan(profile, new Date("2026-07-13T00:00:00"), 28);
            expect(validatePlanExerciseContract(plan)).toEqual([]);
            const athlete = buildAthleteTrainingProfile(profile);
            for (const day of plan.flatMap((s) => (s.secondSession ? [s, s.secondSession] : [s]))) {
              if (!day.title.startsWith("Siłownia:") || !day.structuredSections?.length) continue;
              const work = day.structuredSections
                .filter((s) => !["warmup", "cooldown", "prep"].includes(s.type))
                .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
              const debug = JSON.stringify({
                age,
                gym,
                goal,
                unavailable,
                date: day.date,
                title: day.title,
              });
              expect(new Set(work.map((e) => e.exerciseId)).size, debug).toBe(work.length);
              for (const exercise of day.structuredSections.flatMap((s) =>
                s.blocks.flatMap((b) => b.exercises),
              )) {
                expect(exercise.executionBlockedReason, debug + exercise.exerciseId).toBeFalsy();
                expect(
                  isExerciseAllowedForProfile(getExerciseDefinition(exercise.exerciseId!), athlete)
                    .ok,
                  debug + exercise.exerciseId,
                ).toBe(true);
              }
            }
          }
  }, 30_000);
  it("keeps the generated matrix canonical, nonduplicated and usable across youth/adult experience and goals", () => {
    for (const age of [13, 14, 17, 24])
      for (const gym of ["unknown", "beginner", "intermediate", "advanced"] as const)
        for (const goal of ["strength", "power", "speed"] as const)
          for (const weekPhase of ["adaptation", "development", "deload"] as const)
            for (const mdLabel of ["MD-5", "MD-2", "MD+1"]) {
              const profile: Profile = {
                ...base,
                age,
                goal,
                ...(gym === "unknown"
                  ? {
                      gymExperienceLevel: undefined,
                      strengthTrainingMonths: undefined,
                      movementCompetence: undefined,
                    }
                  : {
                      gymExperienceLevel: gym,
                      strengthTrainingMonths:
                        gym === "beginner" ? 3 : gym === "intermediate" ? 12 : 36,
                      movementCompetence: gym === "beginner" ? "low" : "high",
                      supervisionLevel: age < 18 ? "full" : "some",
                    }),
              };
              const context = { ...ctx, weekPhase, mdLabel };
              const plan = buildStrengthPowerStructured(profile, context)!;
              expect(
                validateGymSession(plan, context),
                JSON.stringify({ age, gym, goal, weekPhase, mdLabel }),
              ).toEqual([]);
              const session = enforceStrengthEligibility(
                sessionFixture({
                  title: plan.title,
                  sessionType: plan.sessionType,
                  structuredSections: plan.sections,
                  sections: structuredToFlat(plan.sections),
                }),
                profile,
              );
              const work = session
                .structuredSections!.filter((s) => !["warmup", "cooldown"].includes(s.type))
                .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
              expect(new Set(work.map((e) => e.exerciseId)).size).toBe(work.length);
              const athlete = buildAthleteTrainingProfile(profile);
              for (const exercise of all(session)) {
                if (exercise.duration) expect(exercise.rir).toBeUndefined();
                if (
                  ["power", "plyometric"].includes(
                    getExerciseDefinition(exercise.exerciseId!)?.category ?? "",
                  )
                )
                  expect(exercise.rir).toBeUndefined();
                expect(
                  exercise.executionBlockedReason,
                  JSON.stringify({ age, gym, goal, weekPhase, mdLabel, exercise }),
                ).toBeFalsy();
                expect(
                  isExerciseAllowedForProfile(getExerciseDefinition(exercise.exerciseId!), athlete)
                    .ok,
                  JSON.stringify({ age, gym, goal, weekPhase, mdLabel, id: exercise.exerciseId }),
                ).toBe(true);
              }
            }
  });
});
