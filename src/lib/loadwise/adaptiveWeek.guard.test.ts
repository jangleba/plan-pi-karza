import { describe, expect, it } from "vitest";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import { adaptMdPlusOneFromMatchMinutes } from "./adaptiveWeek";
import { resolveEffectivePlan } from "./effectivePlan";
import { buildUnavailableSession } from "./dailyPlanCheckin";
import { buildReadiness } from "./readinessModel";
import type { Profile, SessionCompletion, SessionDay } from "./types";

const profile = (extra: Partial<Profile> = {}): Profile => ({
  name: "Test", age: 22, position: "midfielder", level: "intermediate", goal: "speed",
  secondaryLimiter: null, clubTrainingDays: [], individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [], usualMatchDay: null, matchDate: "2026-11-08", matchDates: ["2026-11-08"],
  equipment: [], painInjury: false, doubleSessionsAllowed: "yes_if_safe", guardianConsent: true,
  onboardingComplete: true, createdAt: "2026-11-01", seasonPhase: "inseason", seasonStage: null,
  competitionLevel: "iv_liga", weeklyMatches: true, hasGym: true, hasPitch: true, hasSprintSpace: true,
  ...extra,
});
const match = sessionFixture({ dbId: "match", date: "2026-11-08", dayType: "match", title: "Mecz" });
const monday = (): SessionDay => sessionFixture({ dbId: "monday", date: "2026-11-09", mdLabel: "MD+1",
  dayType: "rest", durationMin: 0, title: "Odpoczynek" });
const completions: Record<string, SessionCompletion> = {
  match: { completed: true, status: "completed", durationMin: 10, rpe: 5, notes: "" },
};

describe("MD+1 cannot undo the final plan's hard constraints", () => {
  it("still adapts an available unprotected day after a short match", () => {
    const result = adaptMdPlusOneFromMatchMinutes([match, monday()], completions, {
      "2026-11-09": buildReadiness("2026-11-09", { sleep: 7, fatigue: 3, jointPain: 0 }),
    }, profile());
    expect(result.plan[1].durationMin).toBe(35);
    expect(result.events).toHaveLength(1);
  });

  it.each([
    { unavailableDays: [1] }, { individualTrainingDays: [2, 3, 4, 5, 6, 7] },
    { individualTrainingDays: [] }, { painInjury: true }, { seasonPhase: "return_injury" as const },
    { goal: "return" as const }, { secondaryLimiter: "return" as const },
    { secondaryLimiter: "fatigue" as const },
  ])("does not add work back after the profile restricted it: %o", extra => {
    const day = monday();
    const result = resolveEffectivePlan([match, day], {}, { profile: profile(extra), completions });
    expect(result[1].durationMin).toBe(0);
    expect(result[1].sections.main).toEqual([]);
  });

  it("respects today's explicit unavailable decision from check-in", () => {
    const day = monday();
    const replacement = buildUnavailableSession(day);
    const result = resolveEffectivePlan([match, day], { [day.date]: [{
      id: "unavailable", date: day.date, type: "swap", reason: "[daily-checkin:unavailable]",
      safetyStatus: "swapped_by_user", session: replacement, originalSession: day,
      createdAt: "2026-11-09T08:00:00Z",
    }] }, { profile: profile(), completions });
    expect(result[1].title).toBe("Dziś bez treningu");
    expect(result[1].durationMin).toBe(0);
    expect(result[1].isUnavailable).toBe(true);
  });

  it("does not replace a club obligation with derived compensation", () => {
    const day = { ...monday(), dayType: "club" as const, title: "Trening klubowy", durationMin: 90 };
    expect(adaptMdPlusOneFromMatchMinutes([match, day], completions, {}, profile()).plan[1]).toBe(day);
  });

  it.each(["started", "completed"] as const)("keeps the second slot's %s snapshot", status => {
    const second = sessionFixture({ dbId: "second", date: "2026-11-09", title: "Wybrana technika", durationMin: 20 });
    const day = { ...monday(), secondSession: second };
    const logs = { ...completions, second: { completed: status === "completed", status, rpe: 5,
      notes: "", executionSnapshot: second } };
    const result = resolveEffectivePlan([match, day], {}, { profile: profile(), completions: logs });
    expect(result[1].secondSession?.dbId).toBe("second");
    expect(result[1].secondSession?.title).toBe("Wybrana technika");
    expect(result[1].secondSession?.durationMin).toBe(20);
  });
});
