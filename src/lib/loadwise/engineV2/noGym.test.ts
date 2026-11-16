import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

/** Without a gym, A/B still cover push, pull and knee flexion with equipment-free variants. */
const athlete = (o: Record<string, unknown> = {}): Profile =>
  ({
    name: "home",
    age: 17,
    position: "midfielder",
    level: "intermediate",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21"],
    weeklyMatches: true,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "light_only",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    seasonPhase: "in_season",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: false,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "intermediate",
    strengthTrainingMonths: 12,
    movementCompetence: "medium",
    supervisionLevel: "some",
    ...o,
  }) as unknown as Profile;
const START = "2026-11-16";
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const gymIds = (plan: SessionDay[]) =>
  plan
    .flatMap(slots)
    .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")))
    .flatMap((s) => s.engineV2!.exercises.map((e) => [e.role, e.exerciseId] as const));

describe("strength without a gym", () => {
  it("no equipment: valuable bodyweight work stays, a missing loaded main lift is reported", () => {
    const p = athlete();
    const r = generateTrainingPlan(p, { startDate: START, weeks: 2, minutesPerSession: 60 });
    const rows = gymIds(r.plan);
    expect(rows).toContainEqual(["knee_flexion", "bridge_walkout"]);
    // 16+: no trivial bodyweight movement fills a main strength role.
    for (const [role, id] of rows)
      if (["knee_strength", "hip_strength", "unilateral_strength", "push"].includes(role))
        expect([
          "bodyweight_squat",
          "glute_bridge",
          "bodyweight_split_squat",
          "incline_push_up",
        ]).not.toContain(id);
    const unmet = r.issues.filter((i) => i.code === "UNMET_STIMULUS").map((i) => i.message);
    expect(unmet.some((m) => m.startsWith("Brak wariantu z obciążeniem"))).toBe(true);
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("a novice with low movement competence pushes against the wall instead of having no push task", () => {
    const p = athlete({
      age: 16,
      level: "beginner",
      equipment: ["band"],
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 0,
      movementCompetence: "low",
      supervisionLevel: "none",
    });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    expect(gymIds(r.plan)).toContainEqual(["push", "wall_push_up"]);
    expect(r.issues.some((i) => i.message.includes("pchanie"))).toBe(false);
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("a gym keeps the gym variants", () => {
    const p = athlete({
      hasGym: true,
      equipment: ["barbell", "rack", "dumbbell", "bench", "machine", "band"],
    });
    const ids = gymIds(
      generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 }).plan,
    ).map(([, id]) => id);
    expect(ids).not.toContain("wall_push_up");
    expect(ids).not.toContain("prone_ytw_raise");
  });
});
