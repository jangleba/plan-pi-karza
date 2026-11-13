import { describe,expect,it } from "vitest";
import { TRAINING_METHODS } from "./catalogue";
import { METHOD_RESEARCH_SOURCES } from "./research";
import {
normalizeMethodConditions,
normalizeMethodPreferences,
trainingMethodEligibility,
} from "./eligibility";
import {
applyAutomaticMethod,
createMethodSession,
createStrengthMicrodose,
enforceMethodEligibility,
hasCurrentMethodRecipe,
methodRecipeKey,
} from "./planner";
import { buildStrengthPowerStructured,structuredToFlat } from "../strengthBlocks";
import { enforceStrengthEligibility } from "../strengthEligibility";
import { resolveExecutionDay } from "../effectivePlan";
import { classifySession } from "../sessionClassification";
import { decodeStrengthExperience,encodeStrengthExperience } from "../strengthExperience";
import { getExerciseDefinition } from "../exerciseLibrary";
import { validatePlanExerciseContract } from "../planExerciseContract";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile,SessionCompletion,SessionDay } from "../types";
import type { TrainingMethodId } from "./types";
export const methodProfile = {
  name: "Test",
  age: 25,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1, 3],
  individualTrainingDays: [2, 4, 5],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-03",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: [],
  homeEquipment: [],
  painInjury: false,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as Profile;
export function methodSession(domain = "strength"): SessionDay {
  const b = buildStrengthPowerStructured(methodProfile, {
    weekPhase: "development",
    weekIndex: 1,
    mdLabel: "MD-5",
    gymSessionIndexInWeek: 0,
    gymSessionsThisWeekTotal: 2,
    powerFocus: false,
    history: { usedMainThisWeek: [], usedMainLastWeek: [], usedRolesThisWeek: [] },
  })!;
  const title =
    domain === "strength"
      ? "Siłownia: siła dolna"
      : domain === "conditioning"
        ? "Interwały tlenowe"
        : domain === "skills"
          ? "Technika piłkarska"
          : "Sprint: przyspieszenie";
  return sessionFixture({
    date: "2026-11-03",
    title,
    sessionType: title,
    goalOfSession: title,
    mdLabel: "MD-5",
    blockPhaseLabel: "Rozwój",
    blockWeekNumber: 2,
    structuredSections:
      domain === "strength"
        ? b.sections
        : b.sections.filter((s) => ["warmup", "cooldown"].includes(s.type)),
    sections: structuredToFlat(b.sections),
  });
}
const conditions = {
  coachPresent: true,
  participants: 4,
  spaceLengthM: 450,
  equipment: ["flywheel", "fixed_pins", "assistance_rig", "hill", "velocity_device"],
  validatedVelocityDevice: true,
};
const all = (s: SessionDay) =>
  s.structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
describe("method library and routing", () => {
  it("contains 44 distinct referenced methods; support and planning are not pretend workouts", () => {
    expect(TRAINING_METHODS).toHaveLength(44);
    expect(new Set(TRAINING_METHODS.map((m) => m.id)).size).toBe(44);
    for (const m of TRAINING_METHODS) {
      expect(m.sources.length).toBeGreaterThan(0);
      expect(m.sources.every((url) => METHOD_RESEARCH_SOURCES.some((s) => s.url === url))).toBe(
        true,
      );
    }
    expect(TRAINING_METHODS.filter((m) => m.role !== "workout").length).toBe(12);
  });
  it.each(TRAINING_METHODS.filter((m) => m.role === "workout"))(
    "builds $id as an exact, allowed executable recipe",
    (m) => {
      const domain = m.domain === "power" ? "strength" : m.domain;
      const next = createMethodSession(methodSession(domain), methodProfile, m.id, conditions);
      expect(next.trainingMethods?.primary).toBe(m.id);
      expect(hasCurrentMethodRecipe(next)).toBe(true);
      expect(validatePlanExerciseContract([next])).toEqual([]);
      expect(all(next).every((e) => getExerciseDefinition(e.exerciseId ?? ""))).toBe(true);
      if (domain === "sprint")
        expect(all(next).every((e) => !getExerciseDefinition(e.exerciseId!)?.requiresBall)).toBe(
          true,
        );
      if (domain === "conditioning")
        expect(classifySession(next).category).toBe("endurance_conditioning");
      if (domain === "strength") expect(enforceStrengthEligibility(next, methodProfile)).toBe(next);
    },
  );
  it("retains four elements of a coached French contrast and two rounds", () => {
    const s = createMethodSession(methodSession(), methodProfile, "M10", conditions);
    const b = s.structuredSections!.find((s) => s.type === "main")!.blocks[0];
    expect(b.exercises).toHaveLength(4);
    expect(b.exercises.every((e) => e.sets === "2")).toBe(true);
    expect(b.exercises[0].restAfterExercise).toBe("3 min");
    expect(b.exercises[3].restAfterPair).toBe("3 min");
  });
  it("does not unlock specialist methods from football level, age, or gym access alone", () => {
    const p = {
      ...methodProfile,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
    };
    for (const id of [
      "M07",
      "M08",
      "M09",
      "M10",
      "M12",
      "M14",
      "M15",
      "M21",
      "M22",
      "M31",
      "M39",
    ] as TrainingMethodId[])
      expect(trainingMethodEligibility(id, p, methodSession(), conditions).allowed).toBe(false);
  });
  it("requires actual confirmation of coach, device, measured space and participants", () => {
    for (const id of ["M10", "M12", "M21", "M39"] as TrainingMethodId[])
      expect(trainingMethodEligibility(id, methodProfile, methodSession()).allowed).toBe(false);
    expect(trainingMethodEligibility("M19", methodProfile, methodSession("sprint")).allowed).toBe(
      false,
    );
    expect(
      trainingMethodEligibility("M33", methodProfile, methodSession("skills"), {
        spaceLengthM: 30,
        participants: 1,
      }).allowed,
    ).toBe(false);
  });
  it("excludes heavy choices by match proximity and loaded club calendars", () => {
    for (const mdLabel of ["MD-1", "MD-2", "MD+1", "MD"]) {
      expect(
        trainingMethodEligibility("M10", methodProfile, { ...methodSession(), mdLabel }, conditions)
          .allowed,
      ).toBe(false);
      expect(
        trainingMethodEligibility("M03", methodProfile, { ...methodSession(), mdLabel }).allowed,
      ).toBe(false);
    }
    expect(
      trainingMethodEligibility(
        "M10",
        { ...methodProfile, clubTrainingDays: [1, 2, 3, 4] },
        methodSession(),
        conditions,
      ).allowed,
    ).toBe(false);
  });
  it("keeps unavailable equipment unavailable even if a session re-declares it", () => {
    expect(
      trainingMethodEligibility(
        "M12",
        { ...methodProfile, unavailableEquipmentIds: ["flywheel"] },
        methodSession(),
        conditions,
      ).allowed,
    ).toBe(false);
  });
  it("produces a short dose by reducing tasks, retaining preparation and rests", () => {
    const s = createStrengthMicrodose(methodSession(), methodProfile);
    expect(s.durationMin).toBeLessThanOrEqual(20);
    expect(s.trainingMethods?.organization).toContain("M40");
    expect(s.structuredSections!.some((s) => s.type === "warmup")).toBe(true);
    expect(all(s).find((e) => e.label === "A1")?.restAfterExercise).toBe("90 s");
  });
  it("protects snapshots and the second slot independently", () => {
    const old = createMethodSession(methodSession(), methodProfile, "M10", conditions);
    const second = createMethodSession(methodSession(), methodProfile, "M08", conditions);
    second.dbId = "second";
    const day = { ...old, secondSession: second };
    const result = resolveExecutionDay(day, {
      profile: { ...methodProfile, strengthTrainingMonths: 0 },
      completions: {
        "session-1": { status: "started", executionSnapshot: old } as SessionCompletion,
      },
    });
    expect(result.structuredSections).toEqual(old.structuredSections);
    expect(result.secondSession?.trainingMethods?.primary).toBe("M02");
  });
  it("removes obsolete method timers after an independent readiness reduction", () => {
    const old = createMethodSession(methodSession(), methodProfile, "M08", conditions);
    const adapted = {
      ...old,
      structuredSections: old.structuredSections!.map((s) => ({
        ...s,
        blocks: s.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => ({ ...e, sets: "1" })),
        })),
      })),
    };
    const next = enforceMethodEligibility(adapted, methodProfile);
    expect(next.trainingMethods).toBeUndefined();
    expect(all(next).every((e) => !e.methodExecution)).toBe(true);
    expect(all(next).every((e) => e.sets === "1")).toBe(true);
  });
  it("round trips optional method preferences without growing onboarding or accepting unknown IDs", () => {
    const p = {
      ...methodProfile,
      trainingMethodPreferences: {
        strength: "M08" as const,
        periodization: "undulating" as const,
        spaceLengthM: 60,
        declaredEquipment: ["flywheel"],
      },
    };
    const raw = encodeStrengthExperience(p)!;
    expect(raw.length).toBeLessThan(1000);
    expect(decodeStrengthExperience(raw).trainingMethodPreferences).toEqual(
      p.trainingMethodPreferences,
    );
    expect(
      normalizeMethodPreferences({
        strength: "M33",
        conditioning: "M10",
        sprint: "fake",
        spaceLengthM: NaN,
        declaredEquipment: ["barbell", "secret"],
      }),
    ).toEqual({ declaredEquipment: [] });
    expect(
      normalizeMethodConditions({
        coachPresent: "true",
        participants: 0,
        spaceLengthM: Infinity,
        equipment: ["bad"],
      }),
    ).toEqual({ equipment: [] });
  });
  it("uses phase and optional undulation rather than random methods", () => {
    const p = {
      ...methodProfile,
      trainingMethodPreferences: { periodization: "undulating" as const },
    };
    expect(applyAutomaticMethod(methodSession(), p, 0).trainingMethods?.primary).toBe("M03");
    expect(applyAutomaticMethod(methodSession(), p, 1).trainingMethods?.primary).toBe("M08");
    expect(
      applyAutomaticMethod({ ...methodSession(), blockPhaseLabel: "Odciążenie" }, p, 1)
        .trainingMethods?.primary,
    ).not.toBe("M08");
  });
});

it("preserves the current primary movement when shortening a method-tagged upper-body session",()=>{
  const source=createMethodSession(methodSession(),methodProfile,"M03",conditions);
  const copy=JSON.parse(JSON.stringify(source)) as SessionDay;
  const primary=copy.structuredSections!.find(s=>s.type==="main")!.blocks[0].exercises[0];
  Object.assign(primary,{exerciseId:"dumbbell_bench_press",name:"Wyciskanie hantli",visualId:"dumbbell_bench_press"});
  copy.trainingMethods!.recipeKey=methodRecipeKey(copy.structuredSections);
  const next=createStrengthMicrodose(copy,methodProfile);
  const chosen=next.structuredSections!.find(s=>s.type==="main")!.blocks[0].exercises[0];
  expect(chosen.exerciseId).toBe("dumbbell_bench_press");expect(next.durationMin).toBeLessThanOrEqual(20);
});

describe("MD-3 bez automatycznego uproszczenia metody", () => {
  it("mecz za 3 dni nie jest sam w sobie powodem blokady metody wysokiego kosztu", () => {
    const reasons = (mdLabel: string) =>
      trainingMethodEligibility("M07", methodProfile, { ...methodSession(), mdLabel }).reasons;
    expect(reasons("MD-3")).not.toContain("W tym miejscu względem meczu wybierz lżejszą metodę.");
    expect(reasons("MD-2")).toContain("W tym miejscu względem meczu wybierz lżejszą metodę.");
  });
});
