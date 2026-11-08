import { describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { canonicalizeGeneratedExercise } from "./exerciseLibrary";
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
    expect(map("Falling start (start z padania)")).toBe("acceleration_mechanics");
    expect(map("Wspięcia na łydki")).toBe("standing_calf_raise");
    expect(map("Interwały biegowe bez piłki")).toBe("method_interval_run");
  });
});
