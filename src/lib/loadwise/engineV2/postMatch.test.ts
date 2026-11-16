import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { validateEngineSession } from "./validation";
import { isPostMatchDate, POST_MATCH_UPPER_ROLES } from "./postMatch";
import { plusDays } from "./model";

/**
 * User decision 2026-11-16 for a match week that cannot fit two gym sessions:
 * first the day after the match (advanced/elite full session, everyone else upper body + trunk),
 * otherwise one strength session that week, without a warning unless strength is the main goal.
 */
const gym = ["barbell", "rack", "dumbbell", "machine", "band", "bench", "med_ball", "nordic_setup"];
const athlete = (o: Record<string, unknown> = {}): Profile =>
  ({
    name: "md1",
    age: 17,
    position: "midfielder",
    level: "intermediate",
    goal: "speed",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-21",
    matchDates: ["2026-11-21"],
    weeklyMatches: true,
    equipment: gym,
    painInjury: false,
    doubleSessionsAllowed: "light_only",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    seasonPhase: "in_season",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: true,
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
const own = (plan: SessionDay[]) => plan.flatMap(slots).filter((s) => s.engineV2);
const strength = (s: SessionDay) =>
  s.engineV2!.roles.some((r) => r === "strengthA" || r === "strengthB");
const weekOf = (s: SessionDay) =>
  Math.floor((Date.parse(s.date) - Date.parse(START)) / (7 * 86400000));

describe("strength on the day after a match (MD+1)", () => {
  it("club Tue/Thu + Saturday match: the second gym session is upper body + trunk on Sunday", () => {
    const p = athlete();
    const r = generateTrainingPlan(p, { startDate: START, weeks: 4, minutesPerSession: 60 });
    for (let w = 0; w < 4; w++) {
      const gymSessions = own(r.plan).filter((s) => strength(s) && weekOf(s) === w);
      expect(gymSessions).toHaveLength(2);
      const md1 = gymSessions.filter((s) => s.engineV2!.postMatch);
      expect(md1).toHaveLength(1);
      expect(md1[0].engineV2!.postMatch).toBe("upper");
      expect(md1[0].date).toBe(plusDays("2026-11-22", w * 7));
      expect(md1[0].engineV2!.highLower).toBe(false);
      expect(md1[0].engineV2!.exercises.every((e) => POST_MATCH_UPPER_ROLES.has(e.role))).toBe(
        true,
      );
      expect(md1[0].title).toMatch(/^Upper Body & Trunk · [AB]$/);
    }
    expect(r.issues.filter((i) => i.target?.startsWith("strength"))).toEqual([]);
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("the leg session alternates between A and B across weeks", () => {
    const r = generateTrainingPlan(athlete(), {
      startDate: START,
      weeks: 4,
      minutesPerSession: 60,
    });
    const legDays = [0, 1, 2, 3].map(
      (w) =>
        own(r.plan).find((s) => strength(s) && weekOf(s) === w && !s.engineV2!.postMatch)!.engineV2!
          .roles[0],
    );
    expect(new Set(legDays)).toEqual(new Set(["strengthA", "strengthB"]));
  });

  it("advanced and elite players keep the full session after the match", () => {
    const p = athlete({
      age: 22,
      level: "advanced",
      goal: "strength",
      clubTrainingDays: [2, 3, 4],
      gymExperienceLevel: "advanced",
      strengthTrainingMonths: 36,
      movementCompetence: "high",
      supervisionLevel: "full",
    });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    const md1 = own(r.plan).find((s) => s.engineV2!.postMatch);
    expect(md1?.engineV2!.postMatch).toBe("full");
    expect(md1?.date).toBe("2026-11-22");
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("is never used in a week without a match", () => {
    const p = athlete({
      matchDate: null,
      matchDates: [],
      weeklyMatches: false,
      usualMatchDay: null,
      seasonPhase: "offseason",
    });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 2, minutesPerSession: 60 });
    expect(own(r.plan).filter((s) => s.engineV2!.postMatch)).toEqual([]);
  });

  it("a congested week (MD+1 is also MD-2) keeps the day after the match free of gym work", () => {
    const matches = new Set(["2026-11-18", "2026-11-21"]);
    expect(isPostMatchDate("2026-11-19", matches)).toBe(false);
    expect(isPostMatchDate("2026-11-22", matches)).toBe(true);
    const p = athlete({ matchDates: [...matches], weeklyMatches: false, usualMatchDay: null });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    expect(
      own(r.plan).filter((s) => s.date === "2026-11-19" && !s.engineV2!.roles.includes("recovery")),
    ).toEqual([]);
  });

  it("a strength goal keeps the warning when only one gym session fits", () => {
    const p = athlete({
      goal: "strength",
      clubTrainingDays: [1, 2, 4],
      doubleSessionsAllowed: "no",
      unavailableDays: [7],
      individualTrainingDays: [1, 2, 3, 4, 5, 6],
    });
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    const gymCount = own(r.plan).filter(strength).length;
    if (gymCount < 2) expect(r.issues.some((i) => i.code === "UNMET_WEEKLY_TARGET")).toBe(true);
  });

  it("the validator rejects a full post-match session for a non-advanced player and leg work in an upper session", () => {
    const p = athlete();
    const r = generateTrainingPlan(p, { startDate: START, weeks: 1, minutesPerSession: 60 });
    const md1 = own(r.plan).find((s) => s.engineV2!.postMatch === "upper")!;
    const full = structuredClone(md1);
    full.engineV2!.postMatch = "full";
    expect(validateEngineSession(full, p, { minutesPerSession: 60 }).map((i) => i.code)).toContain(
      "POST_MATCH_FULL",
    );
    const legs = structuredClone(md1);
    legs.engineV2!.exercises.push({
      exerciseId: "goblet_squat",
      role: "knee_strength",
      dose: { sets: 2, reps: 8, restSeconds: 90, intent: "controlled" },
      reason: "",
    });
    expect(validateEngineSession(legs, p, { minutesPerSession: 60 }).map((i) => i.code)).toContain(
      "POST_MATCH_UPPER_ONLY",
    );
  });
});
