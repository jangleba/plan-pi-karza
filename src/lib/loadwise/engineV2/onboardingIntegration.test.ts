import { describe, expect, it } from "vitest";
import { trainingFieldsFromAnswers, type OnboardingAnswers } from "../onboardingFlow";
import { profileWritePayloads } from "../store/repository";
import { buildProfile } from "../store/model";
import { getExerciseDefinition } from "../exerciseLibrary";
import { assertPlanExerciseContract } from "../planExerciseContract";
import type { Goal, Level, Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

const today = new Date("2026-11-02T12:00:00Z");
const answers = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  position: "midfielder",
  level: "intermediate",
  competitionLevel: "iv_liga",
  goal: "strength",
  secondaryLimiter: null,
  currentFeelings: ["training_without_direction"],
  desiredFeelings: ["prepared_for_higher_level"],
  clubDays: [],
  unavailableDays: [],
  matchDate: "",
  noMatch: true,
  weeklyMatches: false,
  seasonPhase: "preseason",
  seasonPhaseOverride: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  hasWall: false,
  equipment: [],
  doubleSessionsAllowed: "no",
  ...patch,
});

/** Use the real onboarding mapper and database codecs, without invented extra answers. */
function fromOnboarding(a: OnboardingAnswers, age = 27, extra: Partial<Profile> = {}): Profile {
  const profile: Profile = {
    name: "Onboarding athlete",
    age,
    painInjury: false,
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    accountOwnerType: age < 16 ? "guardian" : "athlete",
    ...(age < 16
      ? {
          guardianName: "Parent",
          guardianEmail: "parent@example.test",
          guardianVerifiedAt: "2026-11-01",
          guardianConsentAt: "2026-11-01",
        }
      : {}),
    ...trainingFieldsFromAnswers(a, null, today),
    ...extra,
  };
  const rows = profileWritePayloads("onboarding-owner", profile, true);
  return buildProfile(rows.profileRow, rows.athleteRow, null)!;
}

const own = (plan: SessionDay[]) =>
  plan.flatMap((day) => [day, day.secondSession]).filter((s): s is SessionDay => !!s?.engineV2);
const goals: Goal[] = [
  "speed",
  "strength",
  "power",
  "endurance",
  "agility",
  "general",
  "matchready",
  "mobility",
  "return",
];
const levels: Level[] = ["beginner", "intermediate", "advanced", "elite"];
const cases = goals.flatMap((goal, g) => levels.map((level, l) => ({ goal, level, g, l })));

describe("existing onboarding to generated plan", () => {
  it.each(cases)(
    "generates validated plans from the actual answers: $goal / $level",
    ({ goal, level, g, l }) => {
      const age = [13, 15, 16, 17, 27][(g + l) % 5];
      const p = fromOnboarding(
        answers({
          goal,
          level,
          hasGym: l % 2 === 0,
          equipment: goal === "general" ? ["Piłka nożna"] : l % 2 ? ["Hantle", "Guma oporowa"] : [],
          clubDays: g % 3 === 0 ? [2, 4] : [],
          unavailableDays: g % 3 === 1 ? [7] : [],
          ...(g % 3 === 2
            ? {
                noMatch: false,
                matchDate: "2026-11-07",
                weeklyMatches: true,
                seasonPhase: "inseason",
              }
            : {}),
          doubleSessionsAllowed: ["no", "light_only", "yes_if_safe"][
            l % 3
          ] as Profile["doubleSessionsAllowed"],
        }),
        age,
      );
      expect(p.onboardingComplete).toBe(true);
      expect(p.strengthTrainingMonths).toBeUndefined();
      const options = { startDate: "2026-11-02", minutesPerSession: 75 };
      const result = generateTrainingPlan(p, options);
      expect(result.plan).toHaveLength(28);
      expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
      expect(() => assertPlanExerciseContract(result.plan)).not.toThrow();
      for (const s of own(result.plan)) {
        expect(p.unavailableDays).not.toContain(new Date(`${s.date}T12:00:00Z`).getUTCDay() || 7);
        expect(s.durationMin).toBeLessThanOrEqual(75);
        for (const e of s.engineV2!.exercises) {
          expect(getExerciseDefinition(e.exerciseId), e.exerciseId).toBeDefined();
          expect(e.role).not.toBe("iso_primer");
        }
        if (s.runningRecipe) {
          expect(s.runningRecipe.paceSource).toBe("effort");
          expect(s.runningRecipe.method).toBe("easy_continuous");
        }
      }
    },
  );

  it("preserves explicitly supplied strength experience through the same save/read path", () => {
    const p = fromOnboarding(answers({ level: "elite" }), 27, {
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 2,
      movementCompetence: "low",
      supervisionLevel: "none",
    });
    const result = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
    expect(result.tier).toBe("foundation");
    expect(p.strengthTrainingMonths).toBe(2);
  });

  it("makes the ball goal reachable through the existing equipment checklist", () => {
    const p = fromOnboarding(answers({ goal: "general", equipment: ["Piłka nożna"] }));
    const result = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
    expect(own(result.plan).some((s) => s.engineV2!.roles.includes("skills"))).toBe(true);
  });
});
