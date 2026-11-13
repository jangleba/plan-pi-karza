import { buildFieldMasTestSession } from "./runningWeek";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
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
    // This suite isolates running prescriptions; capacity limits have dedicated tests.
    doubleSessionsAllowed: "yes_if_safe",
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
    movementCompetence: "medium",
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

  it("bez aktualnego MAS nie planuje testu, a każdy bieg jest bez piłki i prowadzony RPE", () => {
    const sessions = endurance(generatePlan(profile(), new Date("2026-07-13T00:00:00"), 7));
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(
      sessions.filter((session) => classifySession(session).subcategory === "field_mas_test"),
    ).toHaveLength(0);
    for (const session of sessions) {
      expect(exerciseText(session)).not.toMatch(/piłk|podani|przyjęci|dryblin/i);
      expect(session.runningRecipe?.paceSource).toBe("effort");
    }
  });

  it("test 5 min na prośbę zawodnika zastępuje bieg pełną recepturą testu", () => {
    const athlete = profile({ movementCompetence: "medium" });
    const run = endurance(generatePlan(athlete, new Date("2026-07-13T00:00:00"), 7))[0];
    const test = buildFieldMasTestSession(run, athlete);
    expect(classifySession(test).subcategory).toBe("field_mas_test");
    expect(test.intensity).toBe("wysoka");
    expect(test.sections.main[0]).toEqual(
      expect.objectContaining({ exerciseId: "field_mas_5_min_test" }),
    );
    const protocol = deriveRunningIntervalProtocol(test)!;
    const work = protocol.steps.filter((step) => step.kind === "work");
    expect(work).toHaveLength(1);
    expect(work[0].target).toMatchObject({ mode: "time", value: 300 });
    expect(protocol.steps[0].phase).toBe("warmup");
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
      // „bez piłki” describes a run, not ball work.
      expect(exerciseText(session).replace(/bez\s+piłki/gi, "")).not.toMatch(
        /piłk|podani|przyjęci|dryblin/i,
      );
    }
  });
});
