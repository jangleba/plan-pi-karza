import { describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { canonicalizeGeneratedExercise, isExerciseAllowedForProfile } from "./exerciseLibrary";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import { getExerciseDefinition } from "./exerciseLibrary";

const getDefinitionKnown = (id: string) => Boolean(getExerciseDefinition(id));
import type { Profile, SessionDay } from "./types";

vi.spyOn(console, "debug").mockImplementation(() => undefined);
vi.spyOn(console, "log").mockImplementation(() => undefined);

const base = {
  name: "x",
  age: 20,
  healthPersonalizationEnabled: false,
  position: "midfielder",
  level: "intermediate",
  goal: "general",
  secondaryLimiter: null,
  clubTrainingDays: [2, 4],
  individualTrainingDays: [1, 3, 5],
  unavailableDays: [],
  usualMatchDay: 6,
  matchDate: "2026-11-14",
  matchDates: ["2026-11-14"],
  equipment: [],
  painInjury: false,
  painLocations: [],
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "inseason",
  seasonStage: "season_mid",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  currentPitchFeelings: [],
  desiredPitchFeelings: [],
  unavailableEquipmentIds: [],
} as unknown as Profile;
const profile = (patch: Partial<Profile>) => ({ ...base, ...patch }) as Profile;
const slots = (plan: SessionDay[]) =>
  plan.flatMap((day) => (day.secondSession ? [day, day.secondSession] : [day]));
const exercises = (plan: SessionDay[]) =>
  slots(plan).flatMap((slot) => Object.values(slot.sections).flat());

describe("plan logic regressions found by the randomized profile scan", () => {
  it("does not give a beginner heavy general strength the day after a match", () => {
    const plan = generatePlan(
      profile({
        age: 16,
        level: "beginner",
        goal: "strength",
        clubTrainingDays: [3],
        individualTrainingDays: [1, 2, 4, 5, 6],
        unavailableDays: [7],
        usualMatchDay: 1,
        matchDate: "2026-06-01",
        matchDates: ["2026-06-01"],
        hasSprintSpace: false,
      }),
      new Date(2026, 4, 22),
      28,
    );
    const heavyGym = slots(plan).filter((s) => s.title === "Siła ogólna");
    expect(heavyGym).toEqual([]);
    const dayAfterMatch = plan.find((d) => d.date === "2026-06-02")!;
    expect(dayAfterMatch.intensity).not.toBe("wysoka");
    expect(dayAfterMatch.title).not.toMatch(/całe ciało|Siła ogólna/);
  });

  it("uses the day after a match for gym only when no other day is free", () => {
    const week = (level: Profile["level"], age: number) =>
      generatePlan(
        profile({
          level,
          age,
          goal: "strength",
          clubTrainingDays: [3, 4, 5],
          individualTrainingDays: [2, 7],
          usualMatchDay: 6,
          matchDate: "2026-11-14",
          matchDates: ["2026-11-14"],
        }),
        new Date(2026, 10, 9),
        7,
      ).find((day) => day.date === "2026-11-15")!;
    // Advanced athletes may lift normally; everyone else, e.g. a 16-year-old, upper body only.
    expect(week("advanced", 20).title).toBe("Siła ogólna");
    for (const [level, age] of [
      ["intermediate", 16],
      ["beginner", 16],
      ["intermediate", 20],
    ] as const) {
      const day = week(level, age);
      expect(day.title).toBe("Lekki tułów i góra ciała");
      expect(day.intensity).toBe("umiarkowana");
    }
  });

  it("never leaves a second session hanging on a rest day", () => {
    const plan = generatePlan(
      profile({
        age: 18,
        level: "beginner",
        goal: "endurance",
        clubTrainingDays: [3, 4, 5],
        individualTrainingDays: [2, 6, 7],
        unavailableDays: [1],
        usualMatchDay: 1,
        matchDate: "2026-07-27",
        matchDates: ["2026-07-27"],
        doubleSessionsAllowed: "light_only",
        hasPitch: false,
      }),
      new Date(2026, 6, 24),
      28,
    );
    expect(plan.filter((d) => d.dayType === "rest" && d.secondSession)).toEqual([]);
  });

  it("names plyometric drills after what the athlete actually does", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const)
      for (let week = 0; week < 3; week++) {
        const plan = generatePlan(
          profile({
            age: 16,
            level,
            goal: "endurance",
            hasGym: false,
            clubTrainingDays: [1, 5, 6, 7],
            individualTrainingDays: [2, 3, 4],
            usualMatchDay: 7,
            matchDate: "2026-11-29",
            matchDates: ["2026-11-29"],
          }),
          new Date(2026, 10, 21 + week * 7),
          28,
        );
        for (const e of exercises(plan)) {
          if (e.exerciseId === "countermovement_jump")
            expect(e.prescription).not.toMatch(/pogo|wieloskok|na nogę|snap/i);
          if (level !== "advanced")
            expect(e.exerciseId ?? "").not.toMatch(/single_leg_hop_and_stick|repeated_broad_jump/);
        }
      }
  });

  it("maps generated names to their real exercise instead of an unrelated fallback", () => {
    const map = (name: string) =>
      canonicalizeGeneratedExercise({ name, prescription: "3 × 4" }).exerciseId;
    expect(map("Trucht wyciszający")).toBe("easy_aerobic_run");
    expect(map("Nordic curl ekscentryczny — lekko")).toBe("eccentric_nordic_hamstring");
    expect(map("Falling start (start z padania)")).toBe("falling_start");
    expect(map("Wspięcia na łydki")).toBe("standing_calf_raise");
    expect(map("Interwały biegowe bez piłki")).toBe("method_interval_run");
  });

  it("derives jump readiness from the football level, never loaded-lift experience", () => {
    const regular = buildAthleteTrainingProfile(
      profile({ age: 16, level: "intermediate", hasGym: false }),
    );
    expect(regular.gymExperienceLevel).toBe("beginner");
    expect(regular.bodyweightCompetenceLevel).toBe("medium");
    expect(regular.movementCompetenceLevel).toBe("low");
    expect(isExerciseAllowedForProfile("bilateral_pogo", regular).ok).toBe(true);
    expect(isExerciseAllowedForProfile("countermovement_jump", regular).ok).toBe(true);
    expect(regular.exerciseSafetyProfile.allowHeavyCompounds).toBe(false);

    const beginner = buildAthleteTrainingProfile(
      profile({ age: 16, level: "beginner", hasGym: false }),
    );
    expect(beginner.gymExperienceLevel).toBe("none");
    expect(isExerciseAllowedForProfile("bilateral_pogo", beginner).ok).toBe(false);
    expect(isExerciseAllowedForProfile("snap_down", beginner).ok).toBe(true);

    const elite = buildAthleteTrainingProfile(profile({ age: 25, level: "elite", hasGym: true }));
    expect(elite.gymExperienceLevel).toBe("beginner");
    expect(elite.movementCompetenceLevel).toBe("low");
  });

  it("only plans exercises the profile is allowed to do", () => {
    for (const patch of [
      // Found by the scan: prehab gave a beginner without a gym Nordic curls and CMJ.
      {
        age: 16,
        level: "beginner",
        goal: "mobility",
        hasGym: false,
        hasSprintSpace: false,
        clubTrainingDays: [],
        individualTrainingDays: [1, 2, 3, 5, 6, 7],
        unavailableDays: [4],
        usualMatchDay: 6,
        matchDate: "2026-07-25",
        matchDates: ["2026-07-25"],
        doubleSessionsAllowed: "yes_if_safe",
      },
      // Found by the scan: speed sessions gave pogo to profiles the library blocked.
      {
        age: 16,
        level: "intermediate",
        goal: "endurance",
        hasGym: false,
        clubTrainingDays: [1, 5, 6, 7],
        individualTrainingDays: [2, 3, 4],
        usualMatchDay: 7,
        matchDate: "2026-11-29",
        matchDates: ["2026-11-29"],
      },
      {
        age: 14,
        level: "advanced",
        goal: "strength",
        hasGym: false,
        clubTrainingDays: [3, 5, 6],
        individualTrainingDays: [1, 2, 4, 7],
        usualMatchDay: 3,
        matchDate: "2026-12-23",
        matchDates: ["2026-12-23"],
      },
    ] as Partial<Profile>[]) {
      const p = profile(patch);
      const athlete = buildAthleteTrainingProfile(p);
      const blocked = exercises(generatePlan(p, new Date(2026, 10, 2), 28))
        .filter((item) => item.exerciseId && getDefinitionKnown(item.exerciseId))
        .map(
          (item) =>
            [item.exerciseId, isExerciseAllowedForProfile(item.exerciseId, athlete)] as const,
        )
        .filter(([, result]) => !result.ok)
        .map(([id, result]) => `${id}: ${result.reasons.join(" ")}`);
      expect(blocked).toEqual([]);
    }
  });
});
