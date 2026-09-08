import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { classifySession } from "./sessionClassification";
import type { Profile, SessionDay } from "./types";
import { exerciseRequiresBall } from "./sessionContent";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Biegacz",
    age: 20,
    position: "midfielder",
    level: "intermediate",
    goal: "endurance",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga" as Profile["competitionLevel"],
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  };
}

function allSessions(plan: SessionDay[]): SessionDay[] {
  return plan.flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[]);
}

function endurance(plan: SessionDay[]): SessionDay[] {
  return allSessions(plan).filter(
    (session) => classifySession(session).category === "endurance_conditioning",
  );
}

function exerciseText(session: SessionDay): string {
  return [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
    ...session.sections.footballTransfer,
    ...session.sections.cooldown,
  ]
    .map((exercise) => `${exercise.name} ${exercise.prescription} ${exercise.cue ?? ""}`)
    .join(" ");
}

describe("aktywny Plan korzysta z jednego silnika biegowego", () => {
  it("rozumie, że zwrot 'bez piłki' oznacza zakaz piłki, a nie jej wymaganie", () => {
    expect(
      exerciseRequiresBall({
        name: "Interwały bez piłki",
        prescription: "4 x 3 min biegu",
      }),
    ).toBe(false);
  });

  it("bez aktualnego MAS planuje najwyżej jeden test w tygodniu, a każdy bieg jest bez piłki", () => {
    const sessions = endurance(generatePlan(profile(), new Date("2026-07-13T00:00:00"), 7));
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(
      sessions.filter((session) => classifySession(session).subcategory === "field_mas_test"),
    ).toHaveLength(1);
    for (const session of sessions) {
      expect(exerciseText(session)).not.toMatch(/piłk|podani|przyjęci|dryblin/i);
    }
  });

  it("po aktualnym teście używa indywidualnego tempa min/km zamiast starej losowej puli", () => {
    const sessions = endurance(
      generatePlan(
        profile({
          fieldMasKmh: 15,
          fieldMasTestedAt: "2026-07-10",
          runningProgressionLevel: 1,
        }),
        new Date("2026-07-13T00:00:00"),
        7,
      ),
    );
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions).not.toContainEqual(
      expect.objectContaining({ classification: expect.objectContaining({ subcategory: "field_mas_test" }) }),
    );
    for (const session of sessions) {
      expect(session.sections.main.map((exercise) => exercise.prescription).join(" ")).toContain("/km");
      expect(exerciseText(session)).not.toMatch(/piłk|podani|przyjęci|dryblin/i);
    }
  });
});
