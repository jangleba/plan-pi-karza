import { describe, it, expect } from "vitest";
import { buildEnduranceForDate, hasCurrentVerifiedMas } from "./endurance";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import type { Profile } from "../types";

const athlete: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  movementCompetence: "medium",
  supervisionLevel: "none",
  fieldMasKmh: 16,
  fieldMasTestedAt: "2026-11-01",
  fieldMasSourceSessionId: "5f261acf-d1d6-4f50-9513-2fb027932041",
  runningProgressionLevel: 0,
};

describe("date-aware endurance recipes", () => {
  it("uses real current MAS and sport preparation independently of gym experience", () => {
    const r = buildEnduranceForDate(athlete, "2026-11-02", "adaptation")!;
    expect(r.highLower).toBe(true);
    expect(r.tier).toBe("foundation");
    expect(r.runningRecipe?.method).toBe("aerobic_intervals");
    expect(r.runningRecipe?.paceSource).toBe("field_mas");
    expect(r.exercises[0].exerciseId).toBe("method_interval_run");
    expect(r.exercises[0].dose).toMatchObject({ sets: 4, seconds: 180, restSeconds: 120 });
    expect(r.minutes).toBe((600 + 4 * 180 + 3 * 120 + 300) / 60);
  });
  it.each<Partial<Profile>>([
    { fieldMasKmh: NaN },
    { fieldMasKmh: Infinity },
    { fieldMasKmh: 30 },
    { fieldMasKmh: 6 },
    { fieldMasTestedAt: "2026-11-03" },
    { fieldMasTestedAt: "2026-02-30" },
    { fieldMasTestedAt: "2026-10-01" },
    { fieldMasSourceSessionId: null },
  ])("does not derive interval pace from invalid, future, old or untraceable data: %j", (patch) => {
    const r = buildEnduranceForDate({ ...athlete, ...patch }, "2026-11-02", "development")!;
    expect(r.runningRecipe?.method).toBe("easy_continuous");
    expect(r.runningRecipe?.paceSource).toBe("effort");
    expect(r.runningRecipe?.blocks[0].intensity.pace).toBeUndefined();
    expect(r.highLower).toBe(false);
  });
  it("expires a test against the actual training date, not just generation start", () => {
    expect(hasCurrentVerifiedMas(athlete, "2026-11-28")).toBe(true);
    expect(hasCurrentVerifiedMas(athlete, "2026-11-29")).toBe(false);
    expect(buildEnduranceForDate(athlete, "2026-11-29", "development")?.highLower).toBe(false);
  });
  it("keeps strength-priority, deload, transition and forced-light work easy", () => {
    expect(
      buildEnduranceForDate({ ...athlete, goal: "strength" }, "2026-11-02", "development")
        ?.highLower,
    ).toBe(false);
    expect(buildEnduranceForDate(athlete, "2026-11-02", "deload")?.highLower).toBe(false);
    expect(
      buildEnduranceForDate({ ...athlete, seasonPhase: "transition" }, "2026-11-02", "development")
        ?.highLower,
    ).toBe(false);
    expect(buildEnduranceForDate(athlete, "2026-11-02", "development", true)?.highLower).toBe(
      false,
    );
  });
  it("uses lower youth interval doses and never treats early-youth as an adult", () => {
    const adult = buildEnduranceForDate(athlete, "2026-11-02", "adaptation")!;
    const youth = buildEnduranceForDate({ ...athlete, age: 16 }, "2026-11-02", "adaptation")!;
    expect(youth.exercises[0].dose).toMatchObject({ sets: 3, seconds: 120 });
    expect(youth.minutes).toBeLessThan(adult.minutes);
    expect(
      buildEnduranceForDate({ ...athlete, age: 14 }, "2026-11-02", "adaptation")?.highLower,
    ).toBe(false);
  });
  it("preserves all recoveries in numeric recipes and the run counter", () => {
    for (const phase of ["adaptation", "development", "peak", "deload"] as const) {
      const r = buildEnduranceForDate(athlete, "2026-11-02", phase)!;
      expect(r.minutes * 60).toBe(recipeTotalSeconds(r.runningRecipe!));
      expect(r.runningRecipe?.method).not.toBe("field_mas_test");
      expect(r.sprintMetres).toBe(0);
    }
  });
  it("does not turn corrupt progression levels into maximum doses", () => {
    expect(
      buildEnduranceForDate(
        { ...athlete, runningProgressionLevel: Infinity },
        "2026-11-02",
        "adaptation",
      )?.exercises[0].dose.seconds,
    ).toBe(180);
    expect(
      buildEnduranceForDate({ ...athlete, runningProgressionLevel: 2 }, "2026-11-02", "adaptation")
        ?.exercises[0].dose.seconds,
    ).toBe(240);
  });
});
