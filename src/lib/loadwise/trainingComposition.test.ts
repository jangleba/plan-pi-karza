import { describe, it, expect } from "vitest";
import { getExerciseDefinition, getExerciseRegression } from "./exerciseLibrary";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { balanceStrengthSections } from "./strengthSessionBalance";
import { buildStrengthMethod } from "./methods/builders";
import { createMethodSession, methodRecipeKey } from "./methods/planner";
import { buildStrengthPowerStructured, structuredToFlat } from "./strengthBlocks";
import { sessionFixture, sectionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, SessionDay } from "./types";
const base = {
  name: "Audit",
  secondaryLimiter: null,
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-02",
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasPitch: true,
  hasSprintSpace: true,
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  clubTrainingDays: [1, 3],
  hasGym: true,
  equipment: [],
  homeEquipment: [],
  painInjury: false,
  seasonPhase: "inseason",
  seasonPhaseOverride: true,
} as Profile;
const work = (s: SessionDay) =>
  s.structuredSections
    ?.filter((s) => ["main", "accessory"].includes(s.type))
    .flatMap((s) => s.blocks.flatMap((b) => b.exercises)) ?? [];
describe("final player-facing training composition", () => {
  it("does not reset block progression when automatic method metadata is applied", () => {
    const p = {
      ...base,
      gymExperienceLevel: "advanced" as const,
      strengthTrainingMonths: 36,
      movementCompetence: "high" as const,
      supervisionLevel: "some" as const,
    };
    const built = buildStrengthPowerStructured(p, {
      mdLabel: "MD-5",
      weekPhase: "development",
      weekIndex: 1,
      gymSessionIndexInWeek: 0,
      gymSessionsThisWeekTotal: 2,
      powerFocus: false,
      history: { usedMainThisWeek: [], usedMainLastWeek: [], usedRolesThisWeek: [] },
    })!;
    const session = sessionFixture({
      title: built.title,
      sessionType: built.sessionType,
      structuredSections: built.sections,
      sections: structuredToFlat(built.sections),
      mdLabel: "MD-5",
      blockWeekNumber: 2,
      blockPhaseLabel: "Rozwój",
      durationMin: built.durationMin,
    });
    const prior = work(session).find((e) => e.label === "A1")!;
    const next = createMethodSession(session, p, "M03", {}, "automatic"),
      actual = work(next).find((e) => e.id === prior.id)!;
    expect(actual.sets).toBe(prior.sets);
    expect(actual.reps).toBe(prior.reps);
    expect(actual.rir).toBe(prior.rir);
    expect(next.trainingMethods?.recipeKey).toBe(methodRecipeKey(next.structuredSections));
  });
  it("removes repeated work and duplicate warm-up bridges, and prescribes holds in seconds", () => {
    const e = { id: "a", exerciseId: "glute_bridge", name: "Most biodrowy", sets: "2", reps: "8" };
    const source = [
      sectionFixture("warmup", [{ ...e, id: "warm" }]),
      sectionFixture("main", [
        e,
        { ...e, id: "repeat" },
        {
          id: "iso",
          exerciseId: "long_lever_hamstring_iso",
          name: "Izometria",
          sets: "2",
          reps: "8",
        },
      ]),
    ];
    const before = JSON.stringify(source),
      out = balanceStrengthSections(source, base, false),
      all = out.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
    expect(all.filter((x) => x.exerciseId === "glute_bridge")).toHaveLength(1);
    expect(all.find((x) => x.id === "iso")?.duration).toMatch(/s$/);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("retains strength rather than only the jump when a power-first method is shortened", () => {
    const p = {
      ...base,
      gymExperienceLevel: "advanced" as const,
      strengthTrainingMonths: 36,
      movementCompetence: "high" as const,
      supervisionLevel: "some" as const,
    };
    const s = sessionFixture({ mdLabel: "MD-5", blockWeekNumber: 2, blockPhaseLabel: "Rozwój" });
    const rows = buildStrengthMethod(s, p, "M06", {}, 20)
      .filter((s) => s.type === "main")
      .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
    expect(rows).toHaveLength(1);
    expect(["power", "plyometric"]).not.toContain(
      getExerciseDefinition(rows[0].exerciseId ?? "")?.category,
    );
  });
  it("does not regress upper-body pushing through unrelated lower-body movements", () => {
    const a = buildAthleteTrainingProfile(base),
      d = getExerciseDefinition("push_up")!,
      r = getExerciseRegression(d, a)!;
    expect(r.id).toBe("incline_push_up");
    expect(r.movementPattern).toBe("push");
  });
});
