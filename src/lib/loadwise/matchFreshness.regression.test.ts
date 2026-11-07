import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import { enforceFinalPlanPolicy, matchWeekPolicyViolation } from "./finalPlanPolicy";
import { validatePersistedPlan } from "./persistedPlanValidation";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile } from "./types";

const p = {
  name: "Match week",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1, 3],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-02",
  seasonPhase: "inseason",
  seasonPhaseOverride: true,
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: [],
  painInjury: false,
  gymExperienceLevel: "advanced",
  movementCompetence: "high",
  supervisionLevel: "none",
} as Profile;

describe("freshness after all quota repairs and canonical content rebuilds", () => {
  it("does not restore a full MD-2 sprint or MD-1 conditioning just to fill weekly targets", () => {
    const plan = generatePlan(p, new Date(2026, 10, 2), 28);
    for (const day of plan)
      for (const session of [day, day.secondSession].filter(Boolean))
        expect(
          matchWeekPolicyViolation(session!, day.mdLabel),
          day.date + " " + session!.title,
        ).toBe(false);
    const saturday = plan.find((d) => d.date === "2026-11-07")!;
    expect(saturday.weekMeta?.planningStatus).toBe("reduced");
    expect(saturday.weekMeta?.planningNotes?.join(" ")).toContain("Świeżość");
    // Re-opening an honestly reduced plan must not trigger endless regeneration.
    expect(validatePersistedPlan(plan, p, PLAN_ENGINE_VERSION).issues).toEqual([]);
  });
  it("keeps a genuinely small pre-match primer instead of banning every movement", () => {
    const primer = sessionFixture({
      date: "2026-11-07",
      mdLabel: "MD-1",
      title: "Aktywacja przedmeczowa",
      sessionType: "Aktywacja",
      intensity: "niska",
      durationMin: 15,
      sections: {
        warmup: [],
        main: [{ name: "Luźne prowadzenie piłki", prescription: "5 min" }],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
    });
    expect(matchWeekPolicyViolation(primer)).toBe(false);
    expect(enforceFinalPlanPolicy([primer], p)[0].title).toBe(primer.title);
  });
  it("checks both persisted slots, while retaining external and protected execution", () => {
    const run = sessionFixture({
      date: "2026-11-07",
      mdLabel: "MD-1",
      title: "Spokojny bieg ciągły",
      sessionType: "Bieganie / wydolność",
      durationMin: 25,
      intensity: "niska",
      generatorVersion: "test",
      sections: {
        warmup: [],
        main: [{ name: "Bieg ciągły", prescription: "25 min" }],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
    });
    expect(validatePersistedPlan([run], p, "test").issues).toContainEqual(
      expect.objectContaining({ code: "match-week-load" }),
    );
    const protectedRun = { ...run, executionProtected: true };
    expect(enforceFinalPlanPolicy([protectedRun], p)[0]).toBe(protectedRun);
    const club = { ...run, dayType: "club" as const, externalCommitment: true };
    expect(enforceFinalPlanPolicy([club], p)[0].dayType).toBe("club");
    const withSecond = { ...club, secondSession: run };
    expect(enforceFinalPlanPolicy([withSecond], p)[0].secondSession).toBeNull();
  });
});
